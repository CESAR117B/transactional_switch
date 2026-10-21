import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Alta de una nueva App consumidora del microservicio.
 *
 * OJO: la `key` NO se recibe del cliente — la genera el servidor
 * (se guarda hasheadada con scrypt y sólo se devuelve UNA vez en la
 * respuesta). Tampoco se envía `encryptionKey`: la genera el servidor
 * con ApplicationService.generarLlaveEncriptacion().
 *
 * Los servicios NO se asignan en esta función (será otra función);
 * la app nace con app_servicios vacío.
 */
export class CrearAppDto {
  @IsString({ message: 'identificador_app debe ser texto' })
  @IsNotEmpty({ message: 'identificador_app es requerido' })
  @Matches(/^[a-z0-9][a-z0-9_-]{2,49}$/, {
    message:
      'identificador_app debe ser minúsculas sin espacios: 3 a 50 caracteres ' +
      'alfanuméricos, guion o guion bajo',
  })
  identificador_app: string;

  @IsOptional()
  @IsString({ message: 'nombre debe ser texto' })
  @Length(1, 300, { message: 'nombre debe tener entre 1 y 300 caracteres' })
  nombre?: string;

  @IsOptional()
  @IsString({ message: 'desarrollador debe ser texto' })
  @Length(1, 100, {
    message: 'desarrollador debe tener entre 1 y 100 caracteres',
  })
  desarrollador?: string;

  @IsOptional()
  @IsString({ message: 'ruc debe ser texto' })
  @Length(1, 200, { message: 'ruc debe tener entre 1 y 200 caracteres' })
  ruc?: string;

  @IsOptional()
  @IsBoolean({ message: 'activo debe ser booleano' })
  activo?: boolean;
}

/**
 * Wrapper del patrón RPC del proyecto: el gateway siempre manda
 * { idApp, data }, donde idApp es la App administradora que pide el alta.
 */
export class CrearAppPayloadDto {
  @IsNumber({}, { message: 'idApp debe ser número' })
  @IsNotEmpty({ message: 'idApp es requerido' })
  idApp: number;

  @IsNotEmpty({ message: 'data es requerida' })
  @ValidateNested()
  @Type(() => CrearAppDto)
  data: CrearAppDto;
}
