import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca un controller/ruta como PÚBLICO (sin JWT). El guard global
 * (APP_GUARD → ApiKeyGuard) lo respeta; todo lo demás queda protegido
 * por defecto (fail-closed).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
