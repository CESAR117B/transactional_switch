import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigDbService } from '../config-db/config-db.service';
import { TokenizeCardDto } from '../dto/tokenize-card.dto';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class FirsTokenService {
  private readonly logger = new Logger(FirsTokenService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configDb: ConfigDbService, // Inyectamos la configuración
    private readonly prisma: PrismaService,
    private eventEmitter: EventEmitter2 // 👈 Inyectas el emisor
  ) {}

async permanent_token_card(idApp: number, datosTarjeta: TokenizeCardDto): Promise<any> { 
    // 1. Obtenemos la configuración
    const config = await this.configDb.getFirstTokenConfig();

    const urlFinal = `${config.base_url}/routes/${config.routes.permanent_card}`;
    this.logger.debug(`URL de destino: ${urlFinal}`);

    // 👇 Extraemos también 'idApp' para guardarlo en BD, pero NO enviarlo a FirsToken
    const { temporal, card_cvv, ...payloadLimpio } = datosTarjeta;

    try {
      // 2. Enviamos la petición limpia a FirsToken
      const response = await firstValueFrom(
        this.httpService.post(urlFinal, payloadLimpio, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: config.timeout 
        })
      );  

      // 3. Extraemos la data de la respuesta para mayor legibilidad
      const responseData = response.data;
      const cardDetails = responseData.custom_field_details.card;
      

      // 4. Mapeamos exactamente la respuesta hacia tu modelo de Prisma
      const savedCard = await this.prisma.tokenizedCard.create({
        data: {
          idApp: idApp, // Lo convertimos a BigInt como exige tu BD
          firstokenToken: cardDetails.token,
          cardTruncated: cardDetails.card_truncated,
          franchise: cardDetails.brand.toUpperCase(), // Ej: DINERS -> UPPERCASE
          holderName: responseData.card_holder,
          expirationMonth: responseData.card_month,
          expirationYear: responseData.card_year,
          lastFour: cardDetails.last_four,
          status: 'ACTIVE', // Agregamos un campo para diferenciar temporal de permanente
          metadata: {
            bin: cardDetails.bin // Guardamos el BIN en el JSON opcional por si acaso
          }
        }
      });

      

       this.logger.log(`✅ Tarjeta permanente guardada con ID: ${savedCard.idCard}`);

        this.eventEmitter.emit('audit.record', {
        servicio: 'FIRSTOKEN',
        entidadId: savedCard.idCard,
        entidadName: 'tokenized_cards',
        idApp: idApp,
        operation: 'PERMANENT_TOKEN_CARD',
        reference: responseData.custom_field_details.card.token, // El token generado por FirsToken
        requestPayload: datosTarjeta, // El listener se encargará de sanitizarlo
        responsePayload: response.data,
        status: response.status,
      });

      // Devolvemos la respuesta original de FirsToken, pero le agregamos el ID de la BD
      // convertido a String para que no rompa el JSON en el Gateway
      return {
        ...responseData,
        db_id: savedCard.idCard.toString()
      };

  
      
     } catch (error) {
     
      this.eventEmitter.emit('audit.record', {
        servicio: 'FIRSTOKEN',
        idApp: idApp,
        operation: 'PERMANENT_TOKEN_CARD',
        reference: '',
        requestPayload: datosTarjeta,
        responsePayload: error.response?.data || {},
        status: error.response?.status || 500,
        errorMessage: error.message,
      });
      const mensajeError = error.response?.data || error.message;
      this.logger.error('Fallo en FirsToken o Base de Datos:', mensajeError);
      
      throw new RpcException({
        status: error.response?.status || 500,
        message: mensajeError
      });
    }
  }


  async temporal_token_card(idApp: number, datosTarjeta: any): Promise<any> {
    // 1. Obtenemos la configuración
    const config = await this.configDb.getFirstTokenConfig();
    const urlFinal = `${config.base_url}/routes/${config.routes.temporal_card}`;
    this.logger.debug(`URL de destino (Temporal): ${urlFinal}`);

    // 👇 Solo sacamos 'temporal'. El 'card_cvv' SÍ viaja en payloadLimpio para tokens temporales
    const { temporal, ...payloadLimpio } = datosTarjeta;

    try {
      // 2. Enviamos la petición a FirsToken
      const response = await firstValueFrom(
        this.httpService.post(urlFinal, payloadLimpio, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: config.timeout 
        })
      );
      
      const responseData = response.data;
      const cardDetails = responseData.custom_field_details.card;

       

      // 3. Mapeamos hacia Prisma
      const savedCard = await this.prisma.tokenizedCard.create({
        data: {
          idApp: idApp, 
          firstokenToken: cardDetails.token, // En este caso será el UUID (ej. d54f0486-...)
          cardTruncated: cardDetails.card_truncated,
          franchise: cardDetails.brand.toUpperCase(), 
          holderName: responseData.card_holder,
          expirationMonth: responseData.card_month,
          expirationYear: responseData.card_year,
          lastFour: cardDetails.last_four,
          metadata: {
            bin: cardDetails.bin 
          }
        }
      });

      this.logger.log(`⏳ Tarjeta TEMPORAL guardada con ID: ${savedCard.idCard}`);

      this.eventEmitter.emit('audit.record', {
        servicio: 'FIRSTOKEN',
        entidadId: savedCard.idCard,
        entidadName: 'tokenized_cards',
        idApp: idApp,
        operation: 'TEMPORAL_TOKEN_CARD',
        reference: responseData.custom_field_details.card.token, // El token generado por FirsToken
        requestPayload: datosTarjeta, // El listener se encargará de sanitizarlo
        responsePayload: response.data,
        status: response.status,
      });

      // 4. Devolvemos respuesta con el ID de BD casteado a string
      return {
        ...responseData,
        db_id: savedCard.idCard.toString()
      };
      
    } catch (error) {

      this.eventEmitter.emit('audit.record', {
        servicio: 'FIRSTOKEN',
        idApp: BigInt(idApp),
        operation: 'TEMPORAL_TOKEN_CARD',
        reference: '',
        requestPayload: datosTarjeta,
        responsePayload: error.response?.data || {},
        status: error.response?.status || 500,
        errorMessage: error.message,
      });
      const mensajeError = error.response?.data || error.message;
      this.logger.error('Fallo en FirsToken (Temporal):', mensajeError);

      throw new RpcException({
        status: error.response?.status || 500,
        message: mensajeError
      });
    }
  }
  
}