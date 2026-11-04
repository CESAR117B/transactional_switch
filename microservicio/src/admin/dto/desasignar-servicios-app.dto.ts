import { IsArray, IsNotEmpty, IsString } from 'class-validator';

/**
 * DTO para desasignar uno o más servicios de una app usando códigos alfanuméricos.
 *
 * Los códigos son cadenas de texto que corresponden al campo `codigo` de la
 * tabla `servicios` (ej: 'PAYMENT', 'REPORT', 'INVENTARIO').
 *
 * Se valida que los códigos existan; los que no se encuentren se informan en
 * el error 400 devuelto por el servicio.
 */
export class DesasignarServiciosAppDto {
  @IsNotEmpty({ message: 'El ID de la app es obligatorio' })
  idApp: number;

  @IsArray()
  @IsNotEmpty({ message: 'El array de códigos no puede estar vacío' })
  @IsString({ each: true, message: 'Cada código debe ser un texto' })
  codigos: string[];
}
