import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

/**
 * Alta de una nueva App consumidora del microservicio.
 *
 * La `key` y la `encryptionKey` NO se envían: las genera el servidor y
 * se devuelven UNA sola vez en la respuesta (la key se guarda hasheadada
 * con scrypt, así que no se puede recuperar después).
 *
 * Los servicios NO se asignan en esta función; la app nace sin servicios
 * (asignación en una función posterior).
 */
export class CrearAppDto {
  @ApiProperty({
    description:
      'Identificador único de la app (minúsculas, sin espacios). Sirve como ' +
      'app_id en POST /auth/login.',
    example: 'mi-app-nueva',
    minLength: 3,
    maxLength: 50,
  })
  @IsString({ message: 'identificador_app debe ser texto' })
  @IsNotEmpty({ message: 'identificador_app es requerido' })
  @Matches(/^[a-z0-9][a-z0-9_-]{2,49}$/, {
    message:
      'identificador_app debe ser minúsculas sin espacios: 3 a 50 caracteres ' +
      'alfanuméricos, guion o guion bajo',
  })
  identificador_app: string;

  @ApiPropertyOptional({
    description: 'Nombre comercial de la app (tabla info_app)',
    example: 'Mi Aplicación',
    maxLength: 300,
  })
  @IsOptional()
  @IsString({ message: 'nombre debe ser texto' })
  @Length(1, 300, { message: 'nombre debe tener entre 1 y 300 caracteres' })
  @IsNotEmpty({ message: 'nombre no puede estar vacío' })
  nombre?: string;

  @ApiPropertyOptional({
    description: 'Desarrollador o empresa dueña de la app (tabla info_app)',
    example: 'Acme Cía. Ltda.',
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'desarrollador debe ser texto' })
  @Length(1, 100, {
    message: 'desarrollador debe tener entre 1 y 100 caracteres',
  })
  @IsNotEmpty({ message: 'desarrollador no puede estar vacío' })
  desarrollador?: string;

  @ApiPropertyOptional({
    description: 'RUC del desarrollador (tabla info_app)',
    example: '1790012345001',
    maxLength: 200,
  })
  @IsOptional()
  @IsString({ message: 'ruc debe ser texto' })
  @Length(1, 200, { message: 'ruc debe tener entre 1 y 200 caracteres' })
  @IsNotEmpty({ message: 'ruc no puede estar vacío' })
  ruc?: string;

  @ApiPropertyOptional({
    description: 'Estado inicial de la app (por defecto true)',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'activo debe ser booleano' })
  activo?: boolean;
}
