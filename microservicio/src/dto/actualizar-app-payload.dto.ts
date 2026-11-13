import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min, ValidateNested } from 'class-validator';
import { UpdateAppDto } from './update-app.dto';

/**
 * Payload para actualizar los datos de una app consumidora.
 *
 * - `idApp`: la app consumidora a actualizar.
 * - `idAppAdmin`: la app administradora que ejecuta la acción (auditoría).
 * - `data`: los datos a actualizar (identificador, nombre, desarrollador, ruc, email).
 */
export class ActualizarAppPayloadDto {
  @Type(() => Number)
  @IsInt({ message: 'idApp debe ser un entero' })
  @Min(1, { message: 'idApp debe ser mayor a 0' })
  idApp: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'idAppAdmin debe ser un entero' })
  @Min(1, { message: 'idAppAdmin debe ser mayor a 0' })
  idAppAdmin?: number;

  @ValidateNested()
  @Type(() => UpdateAppDto)
  data: UpdateAppDto;
}
