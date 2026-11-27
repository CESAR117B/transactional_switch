import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

/**
 * Bloqueo de una app consumidora.
 *
 * El gateway manda siempre el objeto completo:
 *  - `id_app`      → app a bloquear (destino).
 *  - `id_app_admin` → app administradora que ejecuta la acción (auditoría y
 *                   protección contra el autobloqueo).
 */
export class BloquearAppPayloadDto {
  @Type(() => Number)
  @IsInt({ message: 'id_app debe ser un entero' })
  @Min(1, { message: 'id_app debe ser mayor a 0' })
  id_app: number;

  @Type(() => Number)
  @IsInt({ message: 'id_app_admin debe ser un entero' })
  @Min(1, { message: 'id_app_admin debe ser mayor a 0' })
  id_app_admin: number;
}
