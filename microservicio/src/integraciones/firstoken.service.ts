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
import { createHash } from 'crypto';

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
type TipoTarjeta = 'PERMANENT' | 'TEMPORAL';

/** Centinela de `evaluarTarjetaExistente`: hay que reintentar el proveedor. */
const REUTILIZAR_RESERVA = 'REUTILIZAR';

function esObjeto(valor: unknown): valor is JsonObject {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

@Injectable()
export class FirstokenService {
  private readonly logger = new Logger(FirstokenService.name);

  /** Ventana en la que una reserva PENDING se considera "en curso". */
  private static readonly PENDING_EN_CURSO_MS = 2 * 60 * 1000;

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

  /**
   * Una fila PENDING con `firstToken` es una tarjeta legacy (el flujo
   * anterior no marcaba `ACTIVE` en el alta temporal) o una ya completada
   * antes de actualizar el estado. Las reservas nuevas nacen con
   * `firstToken` vacío.
   */
  private esTarjetaCompleta(card: TokenizedCard): boolean {
    return card.firstToken.trim() !== '';
  }

  /** Hash del contenido de la tarjeta (sin la llave local ni datos de control). */
  private hashContenidoTarjeta(payload: JsonObject): string {
    return createHash('sha256')
      .update(JSON.stringify(payload), 'utf8')
      .digest('hex');
  }

  /** Metadatos como objeto plano (sin `any`). */
  private metadataDe(card: TokenizedCard): JsonObject {
    return esObjeto(card.metadata) ? card.metadata : {};
  }

  /**
   * Decide qué hacer con una fila que ya ocupa la Idempotency-Key:
   * - completa (ACTIVE o legacy) → devuelve la respuesta guardada;
   * - completa con otro contenido → 422;
   * - REVOKED → 409;
   * - PENDING vacía reciente → 409 "en curso";
   * - PENDING vacía vieja → `REUTILIZAR` (reintentar el proveedor).
   */
  private async evaluarTarjetaExistente(
    card: TokenizedCard,
    requestHash: string,
  ): Promise<TokenizacionResult | typeof REUTILIZAR_RESERVA> {
    if (card.status === 'REVOKED') {
      throw new RpcException({
        statusCode: 409,
        message:
          'La tokenización con esta Idempotency-Key fue revocada. ' +
          'Generá una Idempotency-Key nueva.',
        error: 'Conflict',
      });
    }

    if (this.esTarjetaCompleta(card)) {
      const hashGuardado = this.metadataDe(card)['requestHash'];
      if (typeof hashGuardado === 'string' && hashGuardado !== requestHash) {
        throw new RpcException({
          statusCode: 422,
          message:
            'La Idempotency-Key ya se usó con otra tarjeta. ' +
            'Generá una Idempotency-Key nueva para tokenizar datos distintos.',
          error: 'Unprocessable Entity',
        });
      }
      if (card.status !== 'ACTIVE') {
        // Tarjeta legacy (o completada justo antes de marcar ACTIVE).
        await this.prisma.tokenizedCard.update({
          where: { idCard: card.idCard },
          data: { status: 'ACTIVE' },
        });
      }
      return this.respuestaDeTarjeta(card);
    }

    const actualizadaMs = card.updatedAt?.getTime?.() ?? 0;
    const hashReserva = this.metadataDe(card)['requestHash'];
    if (typeof hashReserva === 'string' && hashReserva !== requestHash) {
      throw new RpcException({
        statusCode: 422,
        message:
          'La Idempotency-Key ya se usó con otra tarjeta. ' +
          'Generá una Idempotency-Key nueva para tokenizar datos distintos.',
        error: 'Unprocessable Entity',
      });
    }
    const enCurso =
      Date.now() - actualizadaMs < FirstokenService.PENDING_EN_CURSO_MS;
    if (enCurso) {
      throw new RpcException({
        statusCode: 409,
        message:
          'Ya hay una tokenización en curso con esta Idempotency-Key. ' +
          'Esperá su resultado antes de reintentar.',
        error: 'Conflict',
      });
    }
    return REUTILIZAR_RESERVA;
  }

  /**
   * Reserva la Idempotency-Key ANTES de llamar a Firstoken. Los campos del
   * proveedor quedan vacíos hasta completar la fila; la fila PENDING nunca
   * se devuelve al cliente. No requiere cambios de schema (columnas NOT NULL
   * con centinelas vacíos).
   */
  private crearReserva(
    idApp: number,
    idempotencyKey: string,
    tipo: TipoTarjeta,
    requestHash: string,
  ): Promise<TokenizedCard> {
    return this.prisma.tokenizedCard.create({
      data: {
        idApp,
        idempotencyKey,
        firstToken: '',
        cardTruncated: '',
        franchise: '',
        holderName: '',
        expirationMonth: '',
        expirationYear: '',
        lastFour: '',
        status: 'PENDING',
        typeCard: tipo,
        metadata: { requestHash },
      },
    });
  }

  /** Borra la reserva PENDING si el proveedor falló, para permitir reintento. */
  private async liberarReserva(card: TokenizedCard): Promise<void> {
    try {
      await this.prisma.tokenizedCard.deleteMany({
        where: { idCard: card.idCard, status: 'PENDING' },
      });
    } catch (error: unknown) {
      this.logger.warn(
        `No se pudo liberar la reserva de tokenización idCard=${card.idCard}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async permanentTokenCard(
    idApp: number,
    datosTarjeta: TokenizeCardDto,
  ): Promise<TokenizacionResult> {
    return this.tokenizar(idApp, datosTarjeta, 'PERMANENT');
  }

  async temporalTokenCard(
    idApp: number,
    datosTarjeta: TokenizeCardDto,
  ): Promise<TokenizacionResult> {
    return this.tokenizar(idApp, datosTarjeta, 'TEMPORAL');
  }

  /**
   * Flujo común de tokenización con idempotencia por reserva:
   *
   * 1. Reintento con la misma llave → respuesta guardada (sin HTTP).
   * 2. Crear la fila PENDING con la llave ANTES del POST al proveedor: la
   *    unique (idApp, idempotencyKey) impide dos llamadas simultáneas.
   * 3. Completar la fila a ACTIVE con el token cifrado y los datos.
   * 4. Si el proveedor falla, borrar la reserva para permitir un reintento
   *    limpio con la misma llave.
   */
  private async tokenizar(
    idApp: number,
    datosTarjeta: TokenizeCardDto,
    tipo: TipoTarjeta,
  ): Promise<TokenizacionResult> {
    const operation =
      tipo === 'TEMPORAL' ? 'TEMPORAL_TOKEN_CARD' : 'PERMANENT_TOKEN_CARD';
    const idempotencyKey = this.normalizarIdempotencyKey(
      datosTarjeta.idempotency_key,
    );

    // Payload que viaja a Firstoken: nunca incluye la llave local ni
    // `temporal`. El CVV sólo aplica al flujo temporal.
    const { temporal, card_cvv, idempotency_key: _key, ...resto } = datosTarjeta;
    const payloadLimpio: JsonObject =
      tipo === 'TEMPORAL' ? { ...resto, card_cvv } : resto;
    const requestHash = this.hashContenidoTarjeta(payloadLimpio);

    // 1. Reintento / carrera previa.
    const existente = await this.buscarTarjetaPorIdempotencyKey(
      idApp,
      idempotencyKey,
    );
    let reserva: TokenizedCard | null = null;
    if (existente) {
      const evaluada = await this.evaluarTarjetaExistente(
        existente,
        requestHash,
      );
      if (evaluada !== REUTILIZAR_RESERVA) return evaluada;
      reserva = existente;
    }

    // 2. Configuración y URL (no llaman al proveedor).
    const config = await this.configDb.getFirstTokenConfig();
    const ruta =
      tipo === 'TEMPORAL'
        ? config.routes.temporal_card
        : config.routes.permanent_card;
    const urlFinal = `${config.base_url}/routes/${ruta}`;
    this.logger.debug(`URL de destino (${tipo}): ${urlFinal}`);

    // 3. Reservar la llave ANTES del POST.
    if (!reserva) {
      try {
        reserva = await this.crearReserva(
          idApp,
          idempotencyKey,
          tipo,
          requestHash,
        );
      } catch (error: unknown) {
        const esUnique =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002';
        if (!esUnique) throw error;
        // Otro request ganó la reserva: resolver como reintento.
        const ganadora = await this.buscarTarjetaPorIdempotencyKey(
          idApp,
          idempotencyKey,
        );
        if (!ganadora) throw error;
        const evaluada = await this.evaluarTarjetaExistente(
          ganadora,
          requestHash,
        );
        if (evaluada !== REUTILIZAR_RESERVA) return evaluada;
        reserva = ganadora;
      }
    }
    if (!reserva) {
      throw new RpcException({
        statusCode: 500,
        message: 'No se pudo reservar la Idempotency-Key de tokenización.',
        error: 'Internal Server Error',
      });
    }
    const reservaActual = reserva;

    try {
      // 4. Llamar al proveedor con el payload limpio.
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

      // 5. Obtener la llave de la app y cifrar el token.
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

      // 6. Completar la reserva: recién acá existe el token.
      const savedCard = await this.prisma.tokenizedCard.update({
        where: { idCard: reservaActual.idCard },
        data: {
          firstToken: tokenEncriptado,
          cardTruncated: cardDetails.card_truncated,
          franchise: cardDetails.brand.toUpperCase(),
          holderName: responseData.card_holder,
          expirationMonth: responseData.card_month,
          expirationYear: responseData.card_year,
          lastFour: cardDetails.last_four,
          status: 'ACTIVE',
          typeCard: tipo,
          metadata: {
            bin: cardDetails.bin,
            requestHash,
          },
        },
      });

      this.logger.log(
        `Tarjeta ${tipo} guardada con ID: ${savedCard.idCard}`,
      );

      this.eventEmitter.emit('audit.record', {
        servicio: 'FIRSTOKEN',
        entidadId: savedCard.idCard,
        entidadName: 'tokenized_cards',
        idApp: idApp,
        operation,
        requestPayload: datosTarjeta, // El listener se encargará de sanitizarlo
        responsePayload: this.respuestaAuditable(response.data),
        status: response.status,
      });

      return {
        card_truncated: cardDetails.card_truncated,
        card_holder: responseData.card_holder,
        card_month: responseData.card_month,
        card_year: responseData.card_year,
        brand: cardDetails.brand,
        last_four: cardDetails.last_four,
        token: tokenEncriptado,
        typeCard: tipo,
      };
    } catch (error) {
      // El proveedor (o el guardado) falló: liberar la reserva para que un
      // reintento con la MISMA llave pueda ejecutarse.
      await this.liberarReserva(reservaActual);

      const mensajeError = error.response?.data || error.message;
      this.eventEmitter.emit('audit.record', {
        servicio: 'FIRSTOKEN',
        idApp: idApp,
        operation,
        reference: '',
        requestPayload: datosTarjeta,
        responsePayload: this.respuestaAuditable(error.response?.data),
        status: error.response?.status || 500,
        errorMessage: mensajeError,
      });

      this.logger.error(`Fallo en FirsToken (${tipo}):`, mensajeError);

      throw new RpcException({
        statusCode: error.response?.status || 500,
        message: mensajeError,
      });
    }
  }
}

