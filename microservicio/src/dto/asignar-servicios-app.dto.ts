import { IsArray, IsNotEmpty, IsString } from 'class-validator';
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
  idApp: number;

  @IsArray()
  @IsNotEmpty({ message: 'El array de códigos no puede estar vacío' })
  @IsString({ each: true, message: 'Cada código debe ser un texto' })
  codigos: string[];
}