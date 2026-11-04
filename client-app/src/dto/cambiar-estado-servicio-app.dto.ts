import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

/**
 * DTO para activar o desactivar la asignación de UN servicio a una app,
 * usando el campo `activo` de la tabla intermedia `app_servicios`.
 *
 * A diferencia de `desasignar-servicios-app` (que ELIMINA la relación), este
 * endpoint MANTIENE la relación y solo cambia su estado:
 *   - `activo: true`  → la app puede volver a usar el servicio.
 *   - `activo: false` → la app no puede usar el servicio (pero la relación sigue).
 *
 * No afecta el interruptor global `servicios.activo`.
 *
 * Uso en el gateway:
 *   POST /admin/activar-desactivar-servicio-app
 *   Body: { "idApp": 2, "codigo": "PAYMENT", "activo": false }
 *
 * `idApp` es la app OBJETIVO sobre la que actúa el administrador (no la app
 * del token, que es el actor que ejecuta la acción).
 *
 * Protección: requiere @RequireService('ADMIN_APPS') y
 * @RequireCmd('activar_desactivar_servicio_app').
 */
export class CambiarEstadoServicioAppDto {
  @ApiProperty({
    description: 'ID de la app objetivo a la que se le activará/desactivará el servicio.',
    example: 2,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'idApp debe ser un entero' })
  @Min(1, { message: 'idApp debe ser mayor o igual a 1' })
  idApp: number;

  @ApiProperty({
    description: 'Código alfanumérico del servicio (campo `codigo` de `servicios`).',
    example: 'PAYMENT',
  })
  @IsString({ message: 'codigo debe ser un texto' })
  @IsNotEmpty({ message: 'El código del servicio es obligatorio' })
  codigo: string;

  @ApiProperty({
    description:
      'Estado deseado de la asignación: true = activar, false = desactivar.',
    example: false,
  })
  @IsBoolean({ message: 'activo debe ser boolean (true o false)' })
  activo: boolean;
}
