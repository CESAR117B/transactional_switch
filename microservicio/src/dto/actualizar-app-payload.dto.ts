import { Type } from 'class-transformer';
import { IsInt, Min, ValidateNested } from 'class-validator';
import { UpdateAppDto } from './update-app.dto';

/**
 * Payload para actualizar los datos de una app consumidora.
 *
 * - `idApp`: la app consumidora a actualizar.
 * - `data`: los datos a actualizar (identificador, nombre, desarrollador, ruc, email).
 */
export class ActualizarAppPayloadDto {
  @Type(() => Number)
  @IsInt({ message: 'idApp debe ser un entero' })
  @Min(1, { message: 'idApp debe ser mayor a 0' })
  idApp: number;

  @ValidateNested()
  @Type(() => UpdateAppDto)
  data: UpdateAppDto;
}
