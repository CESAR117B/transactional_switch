import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  catchError,
  firstValueFrom,
  throwError,
  timeout,
  TimeoutError,
} from 'rxjs';

/** Código estable que el frontend puede usar para detectar la alerta. */
export const MICROSERVICIO_NO_DISPONIBLE = 'MICROSERVICIO_NO_DISPONIBLE';

/** Tiempo máximo por defecto para una llamada al microservicio (ms). */
const TIMEOUT_DEFAULT_MS = 5000;

/** Errores de red típicos al perder la conexión TCP con el microservicio. */
const CODIGOS_ERROR_CONEXION = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ECONNABORTED',
  'EPIPE',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

/** Mensajes que Nest/Node emiten cuando el socket se cae o queda colgado. */
const PATRON_ERROR_CONEXION =
  /ECONNREFUSED|ECONNRESET|ECONNABORTED|EPIPE|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EAI_AGAIN|Connection closed|socket hang up|Not initialized|timed out/i;

/** Lee MICROSERVICE_TIMEOUT_MS; si es inválido usa el default. */
export function timeoutMicroservicioMs(): number {
  const crudo = process.env.MICROSERVICE_TIMEOUT_MS;
  if (crudo === undefined || crudo.trim() === '') {
    return TIMEOUT_DEFAULT_MS;
  }

  const parseado = Number(crudo);
  if (Number.isInteger(parseado) && parseado > 0) {
    return parseado;
  }

  return TIMEOUT_DEFAULT_MS;
}

/**
 * true si el error corresponde a una pérdida de conexión / timeout de
 * transporte. Los errores de negocio del microservicio (RpcException, que
 * llegan como objeto plano con `statusCode`) NO se consideran de conexión.
 */
export function esErrorDeConexion(error: unknown): boolean {
  if (error === null || error === undefined) {
    return false;
  }

  if (error instanceof TimeoutError) {
    return true;
  }

  if (typeof error === 'object') {
    const posibleError = error as {
      code?: unknown;
      name?: unknown;
      message?: unknown;
      statusCode?: unknown;
    };

    // RpcException del microservicio: objeto plano con statusCode.
    // No es un fallo de conexión y debe propagarse sin transformarse.
    if (
      !(error instanceof Error) &&
      posibleError.statusCode !== undefined
    ) {
      return false;
    }

    if (
      typeof posibleError.code === 'string' &&
      CODIGOS_ERROR_CONEXION.has(posibleError.code)
    ) {
      return true;
    }

    if (
      typeof posibleError.name === 'string' &&
      /TimeoutException$/i.test(posibleError.name)
    ) {
      return true;
    }

    if (typeof posibleError.message === 'string') {
      return PATRON_ERROR_CONEXION.test(posibleError.message);
    }
  }

  return PATRON_ERROR_CONEXION.test(String(error));
}

/**
 * Construye la alerta HTTP 503 que se devuelve al cliente cuando el
 * microservicio no está disponible.
 */
export function crearAlertaMicroservicioNoDisponible(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    statusCode: 503,
    error: 'Service Unavailable',
    code: MICROSERVICIO_NO_DISPONIBLE,
    message:
      'No hay conexión con el microservicio. Intente nuevamente en unos segundos.',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Cliente RPC centralizado.
 *
 * Todas las llamadas al microservicio deben pasar por `enviar()` para que
 * una caída de conexión se traduzca en una alerta 503 clara en lugar de un
 * 500 genérico o de una petición colgada.
 */
@Injectable()
export class MicroserviceRpcService {
  private readonly logger = new Logger(MicroserviceRpcService.name);

  constructor(
    @Inject('MATH_SERVICE') private readonly client: ClientProxy,
  ) {}

  /**
   * Envía un mensaje al microservicio aplicando timeout y traduciendo los
   * errores de transporte a `ServiceUnavailableException` (503).
   *
   * Los errores de negocio (validaciones, 404, etc.) se propagan intactos.
   */
  async enviar<TResult = unknown, TInput = unknown>(
    pattern: unknown,
    payload: TInput,
  ): Promise<TResult> {
    const timeoutMs = timeoutMicroservicioMs();

    return firstValueFrom(
      this.client.send<TResult, TInput>(pattern, payload).pipe(
        timeout(timeoutMs),
        catchError((error: unknown) => {
          if (!esErrorDeConexion(error)) {
            return throwError(() => error);
          }

          this.logger.warn(
            `Sin conexión con el microservicio (${this.describirPattern(
              pattern,
            )}): ${this.describirError(error)}`,
          );

          return throwError(() => crearAlertaMicroservicioNoDisponible());
        }),
      ),
    );
  }

  /**
   * Verifica que exista conexión TCP con el microservicio.
   *
   * Usa `connect()` del ClientProxy, que reconecta cuando el socket se cayó
   * y rechaza con ECONNREFUSED si el microservicio no está escuchando.
   */
  async verificarConexion(): Promise<boolean> {
    try {
      await this.conTimeout(this.client.connect(), timeoutMicroservicioMs());
      return true;
    } catch (error) {
      this.logger.warn(
        `Health check: microservicio no disponible (${this.describirError(
          error,
        )})`,
      );
      return false;
    }
  }

  private conTimeout<T>(promesa: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const limite = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutError()), ms);
    });

    return Promise.race([promesa, limite]).finally(() => {
      if (timer) {
        clearTimeout(timer);
      }
    });
  }

  private describirPattern(pattern: unknown): string {
    if (pattern && typeof pattern === 'object' && 'cmd' in pattern) {
      return String((pattern as { cmd: unknown }).cmd);
    }
    return String(pattern);
  }

  private describirError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (error && typeof error === 'object' && 'message' in error) {
      const mensaje = (error as { message: unknown }).message;
      return Array.isArray(mensaje) ? mensaje.join(', ') : String(mensaje);
    }
    return String(error);
  }
}
