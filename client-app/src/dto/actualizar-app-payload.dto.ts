import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { UpdateAppDto } from './update-app.dto';

/**
 * DTO para actualizar los datos de una app consumidora.
 *
 * - `idApp`: la app consumidora a actualizar.
 * - `data`: los datos a actualizar (identificador, nombre, desarrollador, ruc, email).
 *    Estructura esperada (viene del DTO UpdateAppDto):
 *    - identificador_app: string (requerido)
 *    - nombre?: string
 *    - desarrollador?: string
 *    - ruc?: string
 *    - email?: string
 */
export class ActualizarAppDto {
  @ApiProperty({
    description: 'ID de la app consumidora a actualizar.',
    example: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'idApp debe ser un entero' })
  @Min(1, { message: 'idApp debe ser mayor a 0' })
  idApp: number;

  @ApiProperty({
    description: 'Datos de la app a actualizar.',
    type: 'object',
    properties: {
      identificador_app: {
        type: 'string',
        description: 'Identificador único de la app (minúsculas, sin espacios).',
        example: 'mi-app-nueva',
      },
      nombre: {
        type: 'string',
        description: 'Nombre comercial de la app',
        example: 'Mi Aplicación',
      },
      desarrollador: {
        type: 'string',
        description: 'Desarrollador o empresa dueña de la app',
        example: 'Acme Cía. Ltda.',
      },
      ruc: {
        type: 'string',
        description: 'RUC del desarrollador',
        example: '1790012345001',
      },
      email: {
        type: 'string',
        description: 'Email del desarrollador',
        example: 'desarrollador@ejemplo.com',
      },
    },
  })
  @Type(() => UpdateAppDto)
  data: UpdateAppDto;
}