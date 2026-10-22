import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

/**
 * Bloqueo de una app consumidora.
 *
 * Sólo se envía la app a bloquear: la app administradora que ejecuta la acción
 * sale del JWT (request.appAuth.id_app), no del body.
 */
export class BloquearAppDto {
  @ApiProperty({
    description: 'id_app de la app consumidora que se quiere bloquear',
    example: 5,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'id_app debe ser un entero' })
  @Min(1, { message: 'id_app debe ser mayor a 0' })
  id_app: number;
}
