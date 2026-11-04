import { IsArray, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para asignar uno o más servicios a una app objetivo usando códigos
 * alfanuméricos.
 *
 * Los códigos son cadenas de texto que corresponden al campo `codigo` de la
 * tabla `servicios` (ej: 'PAYMENT', 'REPORT', 'INVENTARIO').
 *
 * `idApp` es la app OBJETIVO sobre la que actúa el administrador (no la app
 * del token, que es el actor que ejecuta la acción).
 *
 * Se valida que el array no esté vacío y que cada elemento sea una cadena de texto.
 */
export class AsignarServiciosAppDto {
  @ApiProperty({
    description: 'ID de la app objetivo a la que se asignarán los servicios',
    example: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'idApp debe ser un entero' })
  @Min(1, { message: 'idApp debe ser mayor o igual a 1' })
  idApp: number;

  @ApiProperty({
    description: 'Array de códigos de los servicios a asignar',
    example: ['PAYMENT', 'REPORT'],
  })
  @IsArray()
  @IsNotEmpty({ message: 'El array de códigos no puede estar vacío' })
  @IsString({ each: true, message: 'Cada código debe ser un texto' })
  codigos: string[];
}
