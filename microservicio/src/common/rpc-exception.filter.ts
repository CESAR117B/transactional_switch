import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import {
  BaseRpcExceptionFilter,
  RpcException,
} from '@nestjs/microservices';
import { Observable } from 'rxjs';

/** Cuerpo de error estable que viaja al gateway por el transporte TCP. */
interface ErrorRpc {
  statusCode: number;
  message: string | string[];
  error: string;
}

/** Errores que llegan como objeto plano (RpcException, HttpException, etc.). */
interface ErrorPlano {
  status?: unknown;
  statusCode?: unknown;
  message?: unknown;
  error?: unknown;
}

const MENSAJE_500 = 'Error interno del servidor';

/** Logger del filtro (no puede ser `static logger`: colisiona con la base). */
const logger = new Logger('RpcExceptionFilter');

/**
 * Filtro global de excepciones del microservicio.
 *
 * Nest sólo serializa bien las `RpcException`; cualquier otra excepción
 * (`HttpException`, `Error`, objetos planos, strings) termina como un 500
 * genérico sin status útil para el gateway. Este filtro normaliza TODO a
 * `{ statusCode, message, error }` antes de delegar en
 * `BaseRpcExceptionFilter`, que es quien responde por el transporte.
 *
 * Con esto los controladores ya no necesitan `try/catch → RpcException`.
 */
@Catch()
export class RpcExceptionFilter extends BaseRpcExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): Observable<never> {
    return super.catch(this.normalizar(exception), host) as Observable<never>;
  }

  private normalizar(exception: unknown): RpcException {
    if (exception instanceof RpcException) {
      const cuerpo = this.cuerpo(exception.getError(), 500);
      // Ya era un error de negocio bien formado: no tocar el mensaje.
      if (this.yaEsEstable(exception.getError())) {
        return exception;
      }
      return new RpcException(cuerpo);
    }

    if (exception instanceof HttpException) {
      // Un controlador/servicio no debería lanzar HTTP, pero si pasa se
      // traduce al mismo status en lugar de degradarlo a 500.
      const status = exception.getStatus();
      return new RpcException(this.cuerpo(exception.getResponse(), status));
    }

    if (exception instanceof Error) {
      logger.error(exception.message, exception.stack);
      return new RpcException({
        statusCode: 500,
        message: MENSAJE_500,
        error: 'Internal Server Error',
      });
    }

    logger.error(`Excepción no controlada: ${String(exception)}`);
    return new RpcException({
      statusCode: 500,
      message: MENSAJE_500,
      error: 'Internal Server Error',
    });
  }

  /** true si el error ya trae `statusCode` numérico y `message`. */
  private yaEsEstable(valor: unknown): boolean {
    if (!this.esPlano(valor)) return false;
    return (
      typeof valor.statusCode === 'number' &&
      (typeof valor.message === 'string' || Array.isArray(valor.message))
    );
  }

  /**
   * Construye el cuerpo normalizado. Respeta `statusCode`/`status`, un
   * `message` en string o array (validación) y un `error` textual.
   */
  private cuerpo(valor: unknown, statusFallback: number): ErrorRpc {
    if (typeof valor === 'string') {
      return {
        statusCode: statusFallback,
        message: valor,
        error: this.nombreError(statusFallback),
      };
    }

    if (this.esPlano(valor)) {
      const statusCode =
        this.numero(valor.statusCode) ??
        this.numero(valor.status) ??
        statusFallback;
      const message = this.mensaje(valor.message, statusCode);
      const error =
        typeof valor.error === 'string' && valor.error.trim() !== ''
          ? valor.error.trim()
          : this.nombreError(statusCode);
      return { statusCode, message, error };
    }

    return {
      statusCode: statusFallback,
      message: this.mensaje(undefined, statusFallback),
      error: this.nombreError(statusFallback),
    };
  }

  private mensaje(valor: unknown, statusCode: number): string | string[] {
    if (Array.isArray(valor)) {
      const partes = valor.filter(
        (parte): parte is string => typeof parte === 'string',
      );
      if (partes.length > 0) return partes;
    }
    if (typeof valor === 'string' && valor.trim() !== '') {
      return valor.trim();
    }
    return statusCode >= 500
      ? MENSAJE_500
      : `Solicitud rechazada (HTTP ${statusCode})`;
  }

  private numero(valor: unknown): number | null {
    if (typeof valor === 'number' && Number.isInteger(valor)) return valor;
    if (typeof valor === 'string' && /^\d{3}$/.test(valor)) {
      return Number(valor);
    }
    return null;
  }

  private nombreError(statusCode: number): string {
    switch (statusCode) {
      case 400:
        return 'Bad Request';
      case 401:
        return 'Unauthorized';
      case 403:
        return 'Forbidden';
      case 404:
        return 'Not Found';
      case 409:
        return 'Conflict';
      case 422:
        return 'Unprocessable Entity';
      case 504:
        return 'Gateway Timeout';
      default:
        return statusCode >= 500 ? 'Internal Server Error' : 'Error';
    }
  }

  private esPlano(valor: unknown): valor is ErrorPlano {
    return (
      typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    );
  }
}
