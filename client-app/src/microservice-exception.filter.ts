import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'crypto';
import {
  crearAlertaMicroservicioNoDisponible,
  esErrorDeConexion,
} from './microservice-rpc.service';

/** Forma laxa de un error plano (RpcException serializada por Nest). */
interface ErrorPlano {
  statusCode?: unknown;
  status?: unknown;
  message?: unknown;
  error?: unknown;
}

/**
 * Filtro global de excepciones.
 *
 * - `HttpException`: se responde con su status y cuerpo originales.
 * - Error de negocio del microservicio (`{ statusCode, status, message }`):
 *   un 4xx se traduce al mismo status HTTP en lugar de caer en un 500.
 * - Error de conexión: 503 estandarizado.
 * - Cualquier otro error: 500 genérico con id de correlación; el detalle
 *   (IPs internas, WSDL, respuestas de proveedores) queda sólo en el log.
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

    // Error de negocio del microservicio: es un objeto plano con statusCode.
    const plano = this.comoErrorPlano(exception);
    const status = this.statusDe(plano);
    if (status !== null && status >= 400 && status < 500) {
      response.status(status).json({
        statusCode: status,
        message: this.mensajeSeguro(plano, status),
        error: this.nombreError(plano, status),
        timestamp: new Date().toISOString(),
      });
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
    const correlacion = randomUUID();
    this.logger.error(
      `Error no controlado (correlación=${correlacion})`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(500).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: `Error interno del servidor (correlación: ${correlacion})`,
      timestamp: new Date().toISOString(),
    });
  }

  private comoErrorPlano(exception: unknown): ErrorPlano | null {
    if (!exception || typeof exception !== 'object') return null;
    return exception as ErrorPlano;
  }

  private statusDe(plano: ErrorPlano | null): number | null {
    if (!plano) return null;
    const crudo = plano.statusCode ?? plano.status;
    if (typeof crudo === 'number' && Number.isInteger(crudo)) return crudo;
    if (typeof crudo === 'string' && /^\d{3}$/.test(crudo)) {
      return Number(crudo);
    }
    return null;
  }

  /**
   * Mensaje apto para el cliente: sólo los 4xx llegan acá y son errores de
   * negocio propios. Aun así se normaliza a string y se acota su longitud.
   */
  private mensajeSeguro(plano: ErrorPlano | null, status: number): string {
    const crudo = plano?.message;
    let texto = '';
    if (Array.isArray(crudo)) {
      const partes = crudo.filter(
        (parte): parte is string => typeof parte === 'string',
      );
      texto = partes.join('; ');
    } else if (typeof crudo === 'string') {
      texto = crudo;
    }

    texto = texto.trim().substring(0, 500);
    if (!texto) return `Solicitud rechazada (HTTP ${status})`;

    // No exponer detalles de infraestructura/proveedores al cliente.
    const pareceInterno =
      /https?:\/\/|\b\d{1,3}(?:\.\d{1,3}){3}\b|wsdl|<html|ECONN|ETIMEDOUT|stack|\n\s+at\s+/i.test(
        texto,
      );
    return pareceInterno
      ? `Solicitud rechazada (HTTP ${status})`
      : texto;
  }

  private nombreError(plano: ErrorPlano | null, status: number): string {
    const crudo = plano?.error;
    if (typeof crudo === 'string' && crudo.trim()) return crudo.trim();
    return status === 409 ? 'Conflict' : 'Bad Request';
  }
}
