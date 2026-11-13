import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigDbService } from '../config-db/config-db.service';
import { TokenizeCardDto } from '../dto/tokenize-card.dto';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UniversalCryptoService } from '../servicios/universal-crypto.service';
import { Prisma, TokenizedCard } from '@prisma/client';

/** Resultado de tokenización que el microservicio devuelve al gateway. */
export interface TokenizacionResult {
  card_truncated: string;
  card_holder: string;
  card_month: string;
  card_year: string;
  brand: string;
  last_four: string;
  token: string;
  typeCard: 'PERMANENT' | 'TEMPORAL';
}

type JsonObject = Record<string, unknown>;

function esObjeto(valor: unknown): valor is JsonObject {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

@Injectable()
export class FirstokenService {
  private readonly logger = new Logger(FirstokenService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configDb: ConfigDbService, // Inyectamos la configuración
    private readonly prisma: PrismaService,
    private eventEmitter: EventEmitter2, // Inyectamos el EventEmitter para auditoría
    private readonly universalCryptoService: UniversalCryptoService,
  ) {}

  /**
   * Copia de la respuesta de Firstoken apta para auditoría: el token de la
   * tarjeta se guarda cifrado en `tokenized_cards` y nunca debe quedar en
   * claro en la tabla de auditoría.
   */
  private respuestaAuditable(data: unknown): Record<string, unknown> {
    if (!esObjeto(data)) return {};

    const copia = JSON.parse(JSON.stringify(data)) as JsonObject;
    const custom = copia.custom_field_details;
    const card = esObjeto(custom) ? custom.card : undefined;
    if (esObjeto(card) && 'token' in card) {
      card.token = '[REDACTED]';
    }
    return copia;
  }

  /**
   * Valida y normaliza la `Idempotency-Key` de tokenización. Sin llave un
   * reintento crearía otra tarjeta (y otro token) para el mismo intento.
   */
  private normalizarIdempotencyKey(idempotencyKey?: string): string {
    const key = idempotencyKey?.trim();
    if (!key) {
      throw new RpcException({
        statusCode: 400,
        message:
          'idempotencyKey es requerida. Generá un UUID por operación y ' +
          'reutilizalo exactamente igual en cada reintento.',
        error: 'Bad Request',
      });
    }
    if (key.length > 100) {
      throw new RpcException({
        statusCode: 400,
        message: 'idempotencyKey supera el máximo de 100 caracteres.',
        error: 'Bad Request',
      });
    }
    return key;
  }

  /** Tarjeta ya creada con esta Idempotency-Key (si el reintento llegó). */
  private buscarTarjetaPorIdempotencyKey(
    idApp: number,
    idempotencyKey: string,
  ): Promise<TokenizedCard | null> {
    return this.prisma.tokenizedCard.findUnique({
      where: { idApp_idempotencyKey: { idApp, idempotencyKey } },
    });
  }

  /** Respuesta pública a partir de la tarjeta persistida (reintentos). */
  private respuestaDeTarjeta(card: TokenizedCard): TokenizacionResult {
    return {
      card_truncated: card.cardTruncated,
      card_holder: card.holderName,
      card_month: card.expirationMonth,
      card_year: card.expirationYear,
      brand: card.franchise,
      last_four: card.lastFour,
      token: card.firstToken,
      typeCard: card.typeCard === 'TEMPORAL' ? 'TEMPORAL' : 'PERMANENT',
    };
  }

  async permanentTokenCard(
    idApp: number,
    datosTarjeta: TokenizeCardDto,
  ): Promise<TokenizacionResult> {
    const idempotencyKey = this.normalizarIdempotencyKey(
      datosTarjeta.idempotencyKey,
    );

    // Reintento: devolver la tarjeta ya guardada sin llamar de nuevo a Firstoken.
    const existente = await this.buscarTarjetaPorIdempotencyKey(
      idApp,
      idempotencyKey,
    );
    if (existente) return this.respuestaDeTarjeta(existente);

    // 1. Obtenemos la configuración
    const config = await this.configDb.getFirstTokenConfig();

    const urlFinal = `${config.base_url}/routes/${config.routes.permanent_card}`;
    this.logger.debug(`URL de destino: ${urlFinal}`);

    // Extraemos también 'idApp' para guardarlo en BD, pero NO enviarlo a
    // FirsToken. idempotencyKey es local y tampoco viaja al proveedor.
    const { temporal, card_cvv, idempotencyKey: _key, ...payloadLimpio } =
      datosTarjeta;

    try {
      // 2. Enviamos la petición limpia a FirsToken
      const response = await firstValueFrom(
        this.httpService.post(urlFinal, payloadLimpio, {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: config.timeout,
        }),
      );

      // 3. Extraemos la data de la respuesta para mayor legibilidad
      const responseData = response.data;
      const cardDetails = responseData.custom_field_details.card;

      // 4. OBTENEMOS LA LLAVE Y ENCRIPTAMOS EL TOKEN
      const appRecord = await this.prisma.app.findUnique({
        where: { id_app: idApp },
        select: { encryptionKey: true },
      });

      if (!appRecord || !appRecord.encryptionKey) {
        throw new RpcException({
          statusCode: 500,
          message: `La app con ID ${idApp} no tiene una llave de encriptación configurada.`,
          error: 'Internal Server Error',
        });
      }

      const tokenEncriptado = this.universalCryptoService.encrypt(
        cardDetails.token,
        appRecord.encryptionKey,
      );

      // 5. Mapeamos exactamente la respuesta hacia tu modelo de Prisma
      let savedCard: TokenizedCard;
      try {
        savedCard = await this.prisma.tokenizedCard.create({
          data: {
            idApp: idApp, // Lo convertimos a BigInt como exige tu BD si es necesario
            idempotencyKey,
            firstToken: tokenEncriptado, // GUARDAMOS LA CADENA ENCRIPTADA
            cardTruncated: cardDetails.card_truncated,
            franchise: cardDetails.brand.toUpperCase(), // Ej: DINERS -> UPPERCASE
            holderName: responseData.card_holder,
            expirationMonth: responseData.card_month,
            expirationYear: responseData.card_year,
            lastFour: cardDetails.last_four,
            status: 'ACTIVE', // Agregamos un campo para diferenciar temporal de permanente
            metadata: {
              bin: cardDetails.bin, // Guardamos el BIN en el JSON opcional por si acaso
            },
            typeCard: 'PERMANENT', // Indicamos que es una tarjeta permanente
          },
        });
      } catch (error: unknown) {
        // Carrera con otro reintento: devolver la tarjeta que ganó.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const ganadora = await this.buscarTarjetaPorIdempotencyKey(
            idApp,
            idempotencyKey,
          );
          if (ganadora) return this.respuestaDeTarjeta(ganadora);
        }
        throw error;
      }

      this.logger.log(
        `✅ Tarjeta permanente guardada con ID: ${savedCard.idCard}`,
      );

      this.eventEmitter.emit('audit.record', {
        servicio: 'FIRSTOKEN',
        entidadId: savedCard.idCard,
        entidadName: 'tokenized_cards',
        idApp: idApp,
        operation: 'PERMANENT_TOKEN_CARD',
        requestPayload: datosTarjeta, // El listener se encargará de sanitizarlo
        responsePayload: this.respuestaAuditable(response.data),
        status: response.status,
      });

      const datamap: TokenizacionResult = {
        card_truncated: cardDetails.card_truncated,
        card_holder: responseData.card_holder,
        card_month: responseData.card_month,
        card_year: responseData.card_year,
        brand: cardDetails.brand,
        last_four: cardDetails.last_four,
        token: tokenEncriptado, // Guardamos el token encriptado en el datamap para auditoría, pero el listener se encargará de no loguearlo
        typeCard: 'PERMANENT',
      };
      // Devolvemos la respuesta de FirsToken con el token ya cifrado.
      return {
        ...datamap,
      };
    } catch (error) {
      const mensajeError = error.response?.data || error.message;
      this.eventEmitter.emit('audit.record', {
        servicio: 'FIRSTOKEN',
        idApp: idApp,
        operation: 'PERMANENT_TOKEN_CARD',
        reference: '',
        requestPayload: datosTarjeta,
        responsePayload: this.respuestaAuditable(error.response?.data),
        status: error.response?.status || 500,
        errorMessage: mensajeError,
      });

      this.logger.error('Fallo en FirsToken o Base de Datos:', mensajeError);

      throw new RpcException({
        statusCode: error.response?.status || 500,
        message: mensajeError,
      });
    }
  }

  async temporalTokenCard(
    idApp: number,
    datosTarjeta: TokenizeCardDto,
  ): Promise<TokenizacionResult> {
    const idempotencyKey = this.normalizarIdempotencyKey(
      datosTarjeta.idempotencyKey,
    );

    const existente = await this.buscarTarjetaPorIdempotencyKey(
      idApp,
      idempotencyKey,
    );
    if (existente) return this.respuestaDeTarjeta(existente);

    // 1. Obtenemos la configuración
    const config = await this.configDb.getFirstTokenConfig();
    const urlFinal = `${config.base_url}/routes/${config.routes.temporal_card}`;
    this.logger.debug(`URL de destino (Temporal): ${urlFinal}`);

    // Solo sacamos 'temporal'. El 'card_cvv' SÍ viaja en payloadLimpio para
    // tokens temporales; idempotencyKey es local y nunca viaja al proveedor.
    const { temporal, idempotencyKey: _key, ...payloadLimpio } = datosTarjeta;

    try {
      // 2. Enviamos la petición a FirsToken
      const response = await firstValueFrom(
        this.httpService.post(urlFinal, payloadLimpio, {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: config.timeout,
        }),
      );

      const responseData = response.data;
      const cardDetails = responseData.custom_field_details.card;

      //  4. OBTENEMOS LA LLAVE Y ENCRIPTAMOS EL TOKEN
      const appRecord = await this.prisma.app.findUnique({
        where: { id_app: idApp },
        select: { encryptionKey: true },
      });

      if (!appRecord || !appRecord.encryptionKey) {
        throw new RpcException({
          statusCode: 500,
          message: `La app con ID ${idApp} no tiene una llave de encriptación configurada.`,
          error: 'Internal Server Error',
        });
      }

      const tokenEncriptado = this.universalCryptoService.encrypt(
        cardDetails.token,
        appRecord.encryptionKey,
      );

      // 3. Mapeamos hacia Prisma
      let savedCard: TokenizedCard;
      try {
        savedCard = await this.prisma.tokenizedCard.create({
          data: {
            idApp: idApp,
            idempotencyKey,
            firstToken: tokenEncriptado, // En este caso será el UUID (ej. d54f0486-...)
            cardTruncated: cardDetails.card_truncated,
            franchise: cardDetails.brand.toUpperCase(),
            holderName: responseData.card_holder,
            expirationMonth: responseData.card_month,
            expirationYear: responseData.card_year,
            lastFour: cardDetails.last_four,
            typeCard: 'TEMPORAL', // Indicamos que es una tarjeta temporal
            metadata: {
              bin: cardDetails.bin,
            },
          },
        });
      } catch (error: unknown) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const ganadora = await this.buscarTarjetaPorIdempotencyKey(
            idApp,
            idempotencyKey,
          );
          if (ganadora) return this.respuestaDeTarjeta(ganadora);
        }
        throw error;
      }

      this.logger.log(
        `⏳ Tarjeta TEMPORAL guardada con ID: ${savedCard.idCard}`,
      );

      this.eventEmitter.emit('audit.record', {
        servicio: 'FIRSTOKEN',
        entidadId: savedCard.idCard,
        entidadName: 'tokenized_cards',
        idApp: idApp,
        operation: 'TEMPORAL_TOKEN_CARD',
        requestPayload: datosTarjeta, // El listener se encargará de sanitizarlo
        responsePayload: this.respuestaAuditable(response.data),
        status: response.status,
      });

      const datamap: TokenizacionResult = {
        card_truncated: cardDetails.card_truncated,
        card_holder: responseData.card_holder,
        card_month: responseData.card_month,
        card_year: responseData.card_year,
        brand: cardDetails.brand,
        last_four: cardDetails.last_four,
        token: tokenEncriptado, // Guardamos el token encriptado en el datamap para auditoría, pero el listener se encargará de no loguearlo
        typeCard: 'TEMPORAL',
      };

      // 4. Devolvemos respuesta con el ID de BD casteado a string
      return {
        ...datamap,
      };
    } catch (error) {
      const mensajeError = error.response?.data || error.message;

      this.eventEmitter.emit('audit.record', {
        servicio: 'FIRSTOKEN',
        idApp: idApp,
        operation: 'TEMPORAL_TOKEN_CARD',
        reference: '',
        requestPayload: datosTarjeta,
        responsePayload: this.respuestaAuditable(error.response?.data),
        status: error.response?.status || 500,
        errorMessage: mensajeError,
      });
      this.logger.error('Fallo en FirsToken (Temporal):', mensajeError);

      throw new RpcException({
        statusCode: error.response?.status || 500,
        message: mensajeError,
      });
    }
  }
}
