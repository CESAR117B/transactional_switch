import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

/**
 * DTO para activar o desactivar un servicio de forma global.
 *
 * Cuando `activo` pasa a `false`, el servicio deja de estar disponible
 * para TODAS las apps (aunque tengan `app_servicios.activo=true`).
 * NULL en `servicios.activo` se considera ACTIVO (mismo criterio que `app.activo`).
 *
 * El `idServicio` debe corresponder con un `id_servicio` existente en la
 * tabla `servicios` de la base de datos.
 *
 * Uso en el gateway:
 *   POST /admin/activar-desactivar-servicio
 *   Body: { "idServicio": 1 }
 *
 * Protección: requiere @RequireService('ADMIN_APPS') y @RequireCmd('activar_desactivar_servicio').
 */
export class ActivarDesactivarServicioDto {

  @ApiProperty({
    description: 'ID numérico del servicio a activar/desactivar globalmente.',
    example: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'idServicio debe ser un entero' })
  @Min(1, { message: 'idServicio debe ser mayor o igual a 1' })
  idServicio: number;
}