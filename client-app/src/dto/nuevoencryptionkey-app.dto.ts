import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para solicitar una nueva encryptionKey para una app consumidora.
 *
 * - `id_app`: la app consumidora objetivo para la cual se generará la nueva encryptionKey.
 * - `id_app_admin`: la app administradora que ejecuta la acción (obtenido del token JWT).
 */
export class NuevoencryptionkeyAppDto {
  @ApiProperty({
      description: 'ID de la app consumidora objetivo para la cual se generará la nueva key.',
      example: 1,
    })
  @Type(() => Number)
  @IsInt({ message: 'id_app debe ser un entero' })
  @Min(1, { message: 'id_app debe ser mayor a 0' })
  id_app: number;
}