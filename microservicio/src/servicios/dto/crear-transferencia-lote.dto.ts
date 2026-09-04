import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsInt,
  Min,
  IsPositive,
  IsEnum,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  Length,
  MaxLength,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export type TipoComision = 'OUR' | 'BEN' | 'SHA'; // OUR: Corre por cuenta del ordenante, BEN: Beneficiario, SHA: Compartido

export class TransferenciaDetalleItemDto {
  @IsInt({ message: 'secuencia debe ser entero' })
  @Min(1, { message: 'secuencia debe ser >= 1' })
  secuencia: number;

  @IsString()
  @IsNotEmpty({ message: 'beneficiarioNombre es requerido' })
  @Length(3, 100, { message: 'beneficiarioNombre entre 3 y 100 caracteres' })
  beneficiarioNombre: string;

  @IsString()
  @IsNotEmpty({ message: 'beneficiarioDireccion es requerida' })
  @Length(3, 100, { message: 'beneficiarioDireccion entre 3 y 100 caracteres' })
  beneficiarioDireccion: string;

  @IsString()
  @IsNotEmpty({ message: 'beneficiarioCuenta es requerida' })
  @Length(5, 34, { message: 'beneficiarioCuenta entre 5 y 34 caracteres' })
  beneficiarioCuenta: string; // IBAN o Número de Cuenta Internacional

  @IsString()
  @IsNotEmpty({ message: 'bancoDestinoNombre es requerido' })
  @Length(3, 100, { message: 'bancoDestinoNombre entre 3 y 100 caracteres' })
  bancoDestinoNombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'bancoDestinoDireccion máx 100 caracteres' })
  bancoDestinoDireccion?: string;

  @IsString()
  @IsNotEmpty({ message: 'codigoSwiftAba es requerido' })
  @Matches(/^[A-Z0-9]{8,11}$/, { message: 'codigoSwiftAba debe ser SWIFT/BIC 8-11 alfanumérico mayúsculas' })
  codigoSwiftAba: string; // Código SWIFT (BIC) o ABA del banco destino

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{8,11}$/, { message: 'bancoIntermediarioSwift debe ser SWIFT 8-11' })
  bancoIntermediarioSwift?: string; // Opcional: SWIFT del banco intermediario

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'monto debe ser numérico con máx 2 decimales' })
  @IsPositive({ message: 'monto debe ser positivo' })
  monto: number;

  @IsString()
  @IsNotEmpty({ message: 'conceptoInvisibles es requerido' })
  conceptoInvisibles: string; // Motivo/concepto según catálogo SIB

  @IsOptional()
  @IsString()
  @MaxLength(10, { message: 'codigoExoneracionIsd máx 10 caracteres' })
  codigoExoneracionIsd?: string; // Código exoneración ISD (si aplica)

  @IsOptional()
  @IsEnum(['OUR', 'BEN', 'SHA'], { message: 'tipoComision debe ser OUR, BEN o SHA' })
  tipoComision?: TipoComision;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'referencia máx 50 caracteres' })
  referencia?: string;
}

export class CrearTransferenciaLoteDto {
  @IsString()
  @IsNotEmpty({ message: 'cuentaEmpresa es requerida' })
  cuentaEmpresa: string;

  @IsString()
  @IsNotEmpty({ message: 'referenciaLote es requerida' })
  @MaxLength(60, { message: 'referenciaLote máx 60 caracteres' })
  referenciaLote: string;

  @IsArray({ message: 'detalles debe ser un arreglo' })
  @ArrayMinSize(1, { message: 'detalles debe tener al menos 1 elemento' })
  @ValidateNested({ each: true })
  @Type(() => TransferenciaDetalleItemDto)
  detalles: TransferenciaDetalleItemDto[];
}

export class GenerarTransferenciaPayloadDto {
  @IsNumber({}, { message: 'idApp debe ser número' })
  @IsNotEmpty({ message: 'idApp es requerido' })
  idApp: number;

  @ValidateNested()
  @Type(() => CrearTransferenciaLoteDto)
  data: CrearTransferenciaLoteDto;
}
