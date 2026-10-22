import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

/**
 * Bloqueo de una app consumidora.
 *
 * El gateway manda siempre el objeto completo:
 *  - `idApp`      → app a bloquear (destino).
 *  - `idAppAdmin` → app administradora que ejecuta la acción (auditoría y
 *                   protección contra el autobloqueo).
 */
export class BloquearAppPayloadDto {
  @Type(() => Number)
  @IsInt({ message: 'idApp debe ser un entero' })
  @Min(1, { message: 'idApp debe ser mayor a 0' })
  idApp: number;

  @Type(() => Number)
  @IsInt({ message: 'idAppAdmin debe ser un entero' })
  @Min(1, { message: 'idAppAdmin debe ser mayor a 0' })
  idAppAdmin: number;
}
