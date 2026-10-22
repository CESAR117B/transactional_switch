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
 * DTO para actualizar los datos de una App consumidora.
 *
 * OJO: la `key` NO se recibe del cliente — la genera el servidor
 * (se guarda hasheadada con scrypt y sólo se devuelve UNA vez en la
 * respuesta). Tampoco se envía `encryptionKey`: la genera el servidor
 * con ApplicationService.generarLlaveEncriptacion().
 *
 * Los servicios NO se asignan en esta función (será otra función);
 * la app nace con app_servicios vacío.
 *
 * Los campos disponibles para actualizar son: identificador_app,
 * nombre, desarrollador, ruc y email (en la tabla info_app).
 */
export class UpdateAppDto {
  @ApiProperty({
    description: 'Identificador único de la app (minúsculas, sin espacios).',
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
    description: 'Nombre comercial de la app',
    example: 'Mi Aplicación',
    maxLength: 300,
  })
  @IsOptional()
  @IsString({ message: 'nombre debe ser texto' })
  @Length(1, 300, { message: 'nombre debe tener entre 1 y 300 caracteres' })
  nombre?: string;

  @ApiPropertyOptional({
    description: 'Desarrollador o empresa dueña de la app',
    example: 'Acme Cía. Ltda.',
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'desarrollador debe ser texto' })
  @Length(1, 100, {
    message: 'desarrollador debe tener entre 1 y 100 caracteres',
  })
  desarrollador?: string;

  @ApiPropertyOptional({
    description: 'RUC del desarrollador',
    example: '1790012345001',
    maxLength: 200,
  })
  @IsOptional()
  @IsString({ message: 'ruc debe ser texto' })
  @Length(1, 200, { message: 'ruc debe tener entre 1 y 200 caracteres' })
  ruc?: string;

  @ApiPropertyOptional({
    description: 'Email del desarrollador',
    example: 'desarrollador@ejemplo.com',
    maxLength: 200,
  })
  @IsOptional()
  @IsString({ message: 'email debe ser texto' })
  @Length(1, 200, { message: 'email debe tener entre 1 y 200 caracteres' })
  email?: string;
}