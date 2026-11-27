import { IsInt, IsNotEmpty, Min } from 'class-validator';
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
  id_servicio: number;

  /** App administradora que ejecuta la acción (auditoría). Obligatorio. */
  @Type(() => Number)
  @IsInt({ message: 'id_app_admin debe ser un entero' })
  @Min(1, { message: 'id_app_admin debe ser mayor a 0' })
  id_app_admin: number;
}