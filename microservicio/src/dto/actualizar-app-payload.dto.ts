import { Type } from 'class-transformer';
import { IsInt, Min, ValidateNested } from 'class-validator';
import { UpdateAppDto } from './update-app.dto';

/**
 * Payload para actualizar los datos de una app consumidora.
 *
 * - `id_app`: la app consumidora a actualizar.
 * - `id_app_admin`: la app administradora que ejecuta la acción (auditoría).
 *   Obligatorio: sin actor identificado no se puede auditar la operación.
 * - `data`: los datos a actualizar (user_app, nombre, desarrollador, ruc, email).
 */
export class ActualizarAppPayloadDto {
  @Type(() => Number)
  @IsInt({ message: 'id_app debe ser un entero' })
  @Min(1, { message: 'id_app debe ser mayor a 0' })
  id_app: number;

  @Type(() => Number)
  @IsInt({ message: 'id_app_admin debe ser un entero' })
  @Min(1, { message: 'id_app_admin debe ser mayor a 0' })
  id_app_admin: number;

  @ValidateNested()
  @Type(() => UpdateAppDto)
  data: UpdateAppDto;
}
