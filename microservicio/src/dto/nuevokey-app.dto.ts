import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

/**
 * Solicitud para generar una nueva key para una app consumidora.
 *
 * El gateway o cliente debe enviar:
 *  - `id_app`: la app consumidora objetivo para la cual se generará la nueva key.
 *  - `id_app_admin`: la app administradora que ejecuta la acción (validación contra autobloqueo).
 *
 * El patrón RPC espera el objeto completo con ambas propiedades.
 */
export class NuevokeyAppPayloadDto {
  @Type(() => Number)
  @IsInt({ message: 'id_app debe ser un entero' })
  @Min(1, { message: 'id_app debe ser mayor a 0' })
  id_app: number;

  @Type(() => Number)
  @IsInt({ message: 'id_app_admin debe ser un entero' })
  @Min(1, { message: 'id_app_admin debe ser mayor a 0' })
  id_app_admin: number;
}