import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO para asignar uno o más servicios a una app usando códigos alfanuméricos.
 *
 * Los códigos son cadenas de texto que corresponden al campo `codigo` de la
 * tabla `servicios` (ej: 'PAYMENT', 'REPORT', 'INVENTARIO').
 *
 * Se valida que el array no esté vacío y que cada elemento sea una cadena de texto.
 */
export class AsignarServiciosAppDto {
  @IsNotEmpty({ message: 'El ID de la app es obligatorio' })
  id_app: number;

  /**
   * App administradora que ejecuta la acción (auditoría). Obligatorio: sin
   * actor identificado no se puede auditar la operación.
   */
  @Type(() => Number)
  @IsInt({ message: 'id_app_admin debe ser un entero' })
  @Min(1, { message: 'id_app_admin debe ser mayor a 0' })
  id_app_admin: number;

  @IsArray()
  @IsNotEmpty({ message: 'El array de códigos no puede estar vacío' })
  @IsString({ each: true, message: 'Cada código debe ser un texto' })
  codigos: string[];
}