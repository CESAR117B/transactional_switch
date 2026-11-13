import { IsInt, IsNotEmpty, IsOptional, Min } from 'class-validator';
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

  /** App administradora que ejecuta la acción (auditoría). */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'idAppAdmin debe ser un entero' })
  @Min(1, { message: 'idAppAdmin debe ser mayor a 0' })
  idAppAdmin?: number;
}