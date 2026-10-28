import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

/**
 * Payload para actualizar los datos de una app consumidora.
 *
 * - `idApp`: la app consumidora a actualizar.
 * - `data`: los datos a actualizar (identificador, nombre, desarrollador, ruc, activo).
 */
export class ActualizarAppPayloadDto {
  @Type(() => Number)
  @IsInt({ message: 'idApp debe ser un entero' })
  @Min(1, { message: 'idApp debe ser mayor a 0' })
  idApp: number;

  @Type(() => Object)
  data: any;
}