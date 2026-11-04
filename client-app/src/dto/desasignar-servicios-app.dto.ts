import { IsArray, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para desasignar uno o más servicios de una app objetivo usando códigos
 * alfanuméricos.
 *
 * Los códigos son cadenas de texto que corresponden al campo `codigo` de la
 * tabla `servicios` (ej: 'PAYMENT', 'REPORT', 'INVENTARIO').
 *
 * `idApp` es la app OBJETIVO sobre la que actúa el administrador (no la app
 * del token, que es el actor que ejecuta la acción).
 *
 * Si algún código no existe, el microservicio devuelve un 400 indicando cuáles.
 */
export class DesasignarServiciosAppDto {
  @ApiProperty({
    description: 'ID de la app objetivo de la que se desasignarán los servicios',
    example: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'idApp debe ser un entero' })
  @Min(1, { message: 'idApp debe ser mayor o igual a 1' })
  idApp: number;

  @ApiProperty({
    description: 'Array de códigos de los servicios a desasignar',
    example: ['PAYMENT', 'REPORT'],
  })
  @IsArray()
  @IsNotEmpty({ message: 'El array de códigos no puede estar vacío' })
  @IsString({ each: true, message: 'Cada código debe ser un texto' })
  codigos: string[];
}
