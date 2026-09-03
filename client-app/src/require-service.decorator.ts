import { SetMetadata } from '@nestjs/common';

/**
 * Decorador para exigir que una App autenticada tenga un servicio global asignado.
 * Ideal para colocarlo en la parte superior de un Controlador para proteger todas sus rutas.
 * * @param codigoServicio El código único del servicio en tu base de datos (ej. 'CATALOGO_SRV')
 */
export const RequireService = (codigoServicio: string) => 
  SetMetadata('servicio_requerido', codigoServicio);