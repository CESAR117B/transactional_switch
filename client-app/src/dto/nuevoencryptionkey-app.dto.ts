import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para solicitar una nueva encryptionKey para una app consumidora.
 *
 * - `idApp`: la app consumidora objetivo para la cual se generará la nueva encryptionKey.
 * - `idAppAdmin`: la app administradora que ejecuta la acción (obtenido del token JWT).
 */
export class NuevoencryptionkeyAppDto {
  @ApiProperty({
      description: 'ID de la app consumidora objetivo para la cual se generará la nueva key.',
      example: 1,
    })
  @Type(() => Number)
  @IsInt({ message: 'idApp debe ser un entero' })
  @Min(1, { message: 'idApp debe ser mayor a 0' })
  idApp: number;
}