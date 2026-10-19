import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
} from '@nestjs/throttler';
import type {
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { createHash } from 'crypto';
import {
  rateLimitAppMax,
  rateLimitAppVentanaMs,
} from './throttler.config';

/**
 * Rate limit por IDENTIDAD de app autenticada (no por IP).
 *
 * Se registra como APP_GUARD DESPUÉS de ApiKeyGuard, de modo que
 * `request.appAuth` (id_app, servicios, permisos) ya está inyectado.
 *
 * Reglas:
 *  - Si la petición no está autenticada (p. ej. /auth/login o un token
 *    inválido que ya fue rechazado), este guard no aplica: el rate limit
 *    por IP (ThrottlerGuard 'default') sigue siendo el único.
 *  - Si la petición SÍ está autenticada, se contabiliza en un bucket
 *    GLOBAL por app: todas las peticiones de esa app (cualquier endpoint,
 *    cualquier token vigente) suman al mismo contador (10/min por defecto).
 *
 * Los valores se configuran en el .env (RATE_LIMIT_APP_MAX y
 * RATE_LIMIT_APP_VENTANA_SEG) vía throttler.config.ts.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

  /**
   * Este guard tiene su propia configuración e ignora los throttlers del
   * módulo ('default' → rate limit por IP). Nombre 'app' ⇒ las cabeceras
   * salen como X-RateLimit-*-app.
   */
  override async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    this.throttlers = [
      {
        name: 'app',
        ttl: rateLimitAppVentanaMs(),
        limit: rateLimitAppMax(),
      },
    ];
  }

  /** Sólo aplica a peticiones con una App ya autenticada. */
  override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    return !request.appAuth;
  }

  /** El tracker es la App, no la IP: varias IPs comparten el mismo contador. */
  override async getTracker(req: Record<string, any>): Promise<string> {
    return `app:${req.appAuth?.id_app}`;
  }

  /**
   * Bucket GLOBAL: la clave NO incluye el controller ni el handler, así que
   * el límite por App es el máximo repartido entre TODOS los endpoints.
   * (El sha256 evita exponer el id_app en la clave del storage.)
   */
  override generateKey(
    _context: ExecutionContext,
    tracker: string,
    name: string,
  ): string {
    return createHash('sha256')
      .update(`${name}-${tracker}`)
      .digest('hex');
  }

  override async getErrorMessage(
    _context: ExecutionContext,
    _throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<string> {
    return (
      `Límite de uso alcanzado: tu app puede realizar un máximo de ` +
      `${rateLimitAppMax()} peticiones por minuto. ` +
      `Intenta de nuevo en unos segundos.`
    );
  }
}
