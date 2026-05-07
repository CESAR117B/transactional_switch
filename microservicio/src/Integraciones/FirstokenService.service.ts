import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigDbService } from '../config-db/config-db.service';
import { TokenizeCardDto } from '../dto/tokenize-card.dto';
import { RpcException } from '@nestjs/microservices';

@Injectable()
export class FirsTokenService {
  private readonly logger = new Logger(FirsTokenService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configDb: ConfigDbService // Inyectamos la configuración
  ) {}

  async permanent_token_card(datosTarjeta: TokenizeCardDto): Promise<any> {
    // 1. Obtenemos la configuración (Súper rápido gracias a tu Map en RAM)
    const config = await this.configDb.getFirstTokenConfig();


    const urlFinal = `${config.base_url}/routes/${config.routes.permanent_card}`;
    this.logger.debug(`URL de destino: ${urlFinal}`);

    try {
      // 2. Usamos los datos dinámicos para armar la petición
      const response = await firstValueFrom(
        this.httpService.post(urlFinal, datosTarjeta, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: config.timeout // Usamos también el timeout de tu BD
        })
      );
      
      return response.data;
      
     } catch (error) {
      // Extraemos el mensaje real de FirsToken o el mensaje por defecto
      const mensajeError = error.response?.data || error.message;
      
      this.logger.error('Fallo en FirsToken:', mensajeError);
      
      // Lanzamos un error pequeño, limpio y seguro para viajar por TCP
      throw new RpcException({
        status: error.response?.status || 500,
        message: mensajeError
      });
    }
  }


  async temporal_token_card(datosTarjeta: TokenizeCardDto): Promise<any> {
    // 1. Obtenemos la configuración (Súper rápido gracias a tu Map en RAM)
    const config = await this.configDb.getFirstTokenConfig();
    const urlFinal = `${config.base_url}/routes/${config.routes.temporal_card}`;
    this.logger.debug(`URL de destino: ${urlFinal}`);

    try {
      // 2. Usamos los datos dinámicos para armar la petición
      const response = await firstValueFrom(
        this.httpService.post(urlFinal, datosTarjeta, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: config.timeout // Usamos también el timeout de tu BD
        })
      );
      return response.data;
    } catch (error) {
      // Extraemos el mensaje real de FirsToken o el mensaje por defecto
      const mensajeError = error.response?.data || error.message;

      this.logger.error('Fallo en FirsToken:', mensajeError);

      // Lanzamos un error pequeño, limpio y seguro para viajar por TCP
      throw new RpcException({
        status: error.response?.status || 500,
        message: mensajeError
      });
    }
  }
}