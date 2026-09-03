import { SetMetadata } from '@nestjs/common';

/**
 * Decorador para exigir que una App tenga permiso para un controlador/comando específico.
 * Ideal para colocarlo en rutas individuales (métodos del controlador).
 * * @param cmd El nombre del comando TCP o acción específica en tu base de datos (ej. 'crear_producto', 'get_servicios')
 */
export const RequireCmd = (cmd: string) => 
  SetMetadata('comando_requerido', cmd);