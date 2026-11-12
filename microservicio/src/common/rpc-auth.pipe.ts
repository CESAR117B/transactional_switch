import { Injectable, PipeTransform } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { timingSafeEqual } from 'crypto';

/** Clave del sobre que agrega el gateway a cada llamada RPC. */
export const RPC_AUTH_KEY = '__rpcAuth';

/** Clave donde viaja el payload real dentro del sobre. */
export const RPC_PAYLOAD_KEY = 'payload';

function compararSeguro(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  return (
    bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB)
  );
}

/**
 * Autentica las llamadas TCP al microservicio con un secreto compartido.
 *
 * El gateway envía `{ __rpcAuth: <secreto>, payload: <payload original> }`;
 * este pipe valida el secreto en tiempo constante y devuelve el payload
 * interno para que los handlers y el ValidationPipe sigan recibiendo lo
 * mismo que antes.
 *
 * Sin `MICROSERVICE_SECRET` configurado se falla cerrado: el microservicio no
 * atiende llamadas. Es la segunda capa de defensa detrás de la red interna de
 * Docker (el puerto 3001 no se publica).
 */
@Injectable()
export class RpcAuthPipe implements PipeTransform {
  transform(value: unknown): unknown {
    const secreto = process.env.MICROSERVICE_SECRET;

    if (!secreto) {
      throw new RpcException({
        statusCode: 500,
        message: 'MICROSERVICE_SECRET no está configurado en el microservicio',
        error: 'Internal Server Error',
      });
    }

    if (value === null || typeof value !== 'object') {
      throw new RpcException({
        statusCode: 401,
        message: 'Llamada RPC no autenticada',
        error: 'Unauthorized',
      });
    }

    const sobre = value as Record<string, unknown>;
    const recibido = sobre[RPC_AUTH_KEY];

    if (
      typeof recibido !== 'string' ||
      !compararSeguro(recibido, secreto)
    ) {
      throw new RpcException({
        statusCode: 401,
        message: 'Llamada RPC no autenticada',
        error: 'Unauthorized',
      });
    }

    return sobre[RPC_PAYLOAD_KEY];
  }
}
