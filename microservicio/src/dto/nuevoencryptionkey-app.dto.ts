import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

/**
 * Solicitud para generar una nueva encryptionKey para una app consumidora.
 *
 * El gateway o cliente debe enviar:
 *  - `idApp`: la app consumidora objetivo para la cual se generará la nueva encryptionKey.
 *  - `idAppAdmin`: la app administradora que ejecuta la acción (validación contra autobloqueo).
 *
 * El patrón RPC espera el objeto completo con ambas propiedades.
 */
export class NuevoencryptionkeyAppPayloadDto {
  @Type(() => Number)
  @IsInt({ message: 'idApp debe ser un entero' })
  @Min(1, { message: 'idApp debe ser mayor a 0' })
  idApp: number;

  @Type(() => Number)
  @IsInt({ message: 'idAppAdmin debe ser un entero' })
  @Min(1, { message: 'idAppAdmin debe ser mayor a 0' })
  idAppAdmin: number;
}