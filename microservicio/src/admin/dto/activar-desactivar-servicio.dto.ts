import { IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO para activar o desactivar un servicio de forma global.
 *
 * Cuando `activo` pasa a `false`, el servicio deja de estar disponible
 * para TODAS las apps (aunque tengan `app_servicios.activo=true`).
 * NULL en `servicios.activo` se considera ACTIVO.
 */
export class ActivarDesactivarServicioDto {
  @IsNotEmpty({ message: 'El ID del servicio es obligatorio' })
  @Type(() => Number)
  idServicio: number;
}