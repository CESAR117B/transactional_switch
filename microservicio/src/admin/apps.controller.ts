import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { CrearAppPayloadDto } from '../dto/crear-app.dto';
import { AppsService } from './apps.service';

@Controller('admin')
export class AppsController {
  private readonly logger = new Logger(AppsController.name);

  constructor(private readonly appsService: AppsService) {}

  /**
   * Alta de una app consumidora (sólo la App administradora con el
   * permiso 'registrar_app' puede llegar acá, vía el guard del gateway).
   */
  @MessagePattern({ cmd: 'crear_app' })
  async crearApp(@Payload() payload: CrearAppPayloadDto) {
    const { idApp, data } = payload ?? ({} as CrearAppPayloadDto);

    if (idApp === undefined || idApp === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'idApp es requerido',
      });
    }
    if (!data) {
      throw new RpcException({
        statusCode: 400,
        message: 'data es requerida para crear_app',
      });
    }

    this.logger.log(
      `crear_app idAppAdmin=${idApp} identificador=${data.identificador_app}`,
    );

    try {
      return await this.appsService.crearApp(idApp, data);
    } catch (error: unknown) {
      if (error instanceof RpcException) throw error;
      // Preserva status/message del service y transforma el resto a
      // RpcException para que el TCP lo serialice igual que el resto.
      const err = error as {
        status?: number;
        statusCode?: number;
        message?: string;
        stack?: string;
        error?: unknown;
      };
      const status = err.status ?? err.statusCode ?? 500;
      const message = err.message ?? 'Error interno en crear_app';
      this.logger.error(
        `Error crear_app idAppAdmin=${idApp} identificador=${data.identificador_app}: ${message}`,
        err.stack,
      );
      throw new RpcException({
        statusCode: status,
        message,
        error: err.error,
      });
    }
  }
}
