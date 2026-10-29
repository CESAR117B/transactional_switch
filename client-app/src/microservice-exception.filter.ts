import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  crearAlertaMicroservicioNoDisponible,
  esErrorDeConexion,
} from './microservice-rpc.service';

/**
 * Filtro global de excepciones.
 *
 * Red de seguridad: si alguna llamada al microservicio falla por conexión y
 * el error no fue traducido antes, aquí se devuelve la misma alerta 503.
 * Las HttpException normales (401, 400, etc.) se responden tal cual.
 */
@Catch()
export class MicroserviceExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(MicroserviceExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (response.headersSent) {
      return;
    }

    // Excepciones HTTP normales: respetar status y cuerpo originales.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const cuerpo = exception.getResponse();

      response
        .status(status)
        .json(
          typeof cuerpo === 'string'
            ? { statusCode: status, message: cuerpo }
            : cuerpo,
        );
      return;
    }

    // Error de conexión no controlado con el microservicio.
    if (esErrorDeConexion(exception)) {
      this.logger.error(
        'Pérdida de conexión con el microservicio',
        exception instanceof Error ? exception.stack : String(exception),
      );

      response
        .status(503)
        .json(crearAlertaMicroservicioNoDisponible().getResponse());
      return;
    }

    // Cualquier otro error: no filtrar detalles internos.
    this.logger.error(
      'Error no controlado',
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(500).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Error interno del servidor',
      timestamp: new Date().toISOString(),
    });
  }
}
