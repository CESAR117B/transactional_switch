import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import type { AppAuth as AppAuthInfo, RequestWithAppAuth } from './app-auth.types';

/** Identidad autenticada con `id_app` garantizado por el decorador. */
export type AppAuthConId = AppAuthInfo & { id_app: number };

/**
 * Resuelve y valida `request.appAuth`. Exportado para poder testearlo sin
 * pasar por el pipeline HTTP de Nest.
 */
export function resolverAppAuth(request: RequestWithAppAuth): AppAuthConId {
  const auth = request.appAuth;
  if (!auth?.id_app) {
    throw new BadRequestException(
      'No se pudo identificar la App desde el token',
    );
  }
  return auth as AppAuthConId;
}

/**
 * Inyecta `request.appAuth` (lo agrega el `ApiKeyGuard` global al validar el
 * JWT) y falla con 400 si el guard no pudo identificar la app.
 *
 * Evita repetir en cada handler:
 * ```ts
 * const idApp = req.appAuth?.id_app;
 * if (!idApp) throw new BadRequestException('...');
 * ```
 */
export const AppAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AppAuthConId =>
    resolverAppAuth(ctx.switchToHttp().getRequest<RequestWithAppAuth>()),
);
