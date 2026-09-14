import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({
    description: 'Número secuencial de la transferencia dentro del lote',
    example: 1,
    type: Number,
    minimum: 1,
  })
  @IsInt({ message: 'secuencia debe ser entero' })
  @Min(1, { message: 'secuencia debe ser >= 1' })
  secuencia: number;

  @ApiProperty({
    description: 'Nombre completo o razón social del beneficiario',
    example: 'John Smith',
    type: String,
    minLength: 3,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty({ message: 'beneficiarioNombre es requerido' })
  @Length(3, 100, { message: 'beneficiarioNombre entre 3 y 100 caracteres' })
  beneficiarioNombre: string;

  @ApiProperty({
    description: 'Dirección completa del beneficiario',
    example: '123 Main St, New York, NY 10001, USA',
    type: String,
    minLength: 3,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty({ message: 'beneficiarioDireccion es requerida' })
  @Length(3, 100, { message: 'beneficiarioDireccion entre 3 y 100 caracteres' })
  beneficiarioDireccion: string;

  @ApiProperty({
    description: 'Número de cuenta o IBAN del beneficiario',
    example: 'DE89370400440532013000',
    type: String,
    minLength: 5,
    maxLength: 34,
  })
  @IsString()
  @IsNotEmpty({ message: 'beneficiarioCuenta es requerida' })
  @Length(5, 34, { message: 'beneficiarioCuenta entre 5 y 34 caracteres' })
  beneficiarioCuenta: string; // IBAN o Número de Cuenta Internacional

  @ApiProperty({
    description:
      'Nombre del banco destino donde se acreditará la transferencia',
    example: 'Citibank N.A.',
    type: String,
    minLength: 3,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty({ message: 'bancoDestinoNombre es requerido' })
  @Length(3, 100, { message: 'bancoDestinoNombre entre 3 y 100 caracteres' })
  bancoDestinoNombre: string;

  @ApiPropertyOptional({
    description: 'Dirección del banco destino',
    example: '111 Wall Street, New York, NY 10043, USA',
    type: String,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'bancoDestinoDireccion máx 100 caracteres' })
  bancoDestinoDireccion?: string;

  @ApiProperty({
    description:
      'Código SWIFT/BIC (8-11 caracteres alfanuméricos en mayúsculas) o ABA del banco destino',
    example: 'CITIUS33',
    type: String,
    pattern: '^[A-Z0-9]{8,11}$',
  })
  @IsString()
  @IsNotEmpty({ message: 'codigoSwiftAba es requerido' })
  @Matches(/^[A-Z0-9]{8,11}$/, {
    message: 'codigoSwiftAba debe ser SWIFT/BIC 8-11 alfanumérico mayúsculas',
  })
  codigoSwiftAba: string; // Código SWIFT (BIC) o ABA del banco destino

  @ApiPropertyOptional({
    description: 'Código SWIFT/BIC del banco intermediario (cuando aplica)',
    example: 'BOFAUS3N',
    type: String,
    pattern: '^[A-Z0-9]{8,11}$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{8,11}$/, {
    message: 'bancoIntermediarioSwift debe ser SWIFT 8-11',
  })
  bancoIntermediarioSwift?: string; // Opcional: SWIFT del banco intermediario

  @ApiProperty({
    description: 'Monto de la transferencia con máximo 2 decimales',
    example: 1500.5,
    type: Number,
    minimum: 0.01,
  })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'monto debe ser numérico con máx 2 decimales' },
  )
  @IsPositive({ message: 'monto debe ser positivo' })
  monto: number;

  @ApiProperty({
    description:
      'Concepto o motivo de la transferencia según catálogo SIB / código de invisibles',
    example: 'PAGO_PROVEEDOR',
    type: String,
  })
  @IsString()
  @IsNotEmpty({ message: 'conceptoInvisibles es requerido' })
  conceptoInvisibles: string; // Motivo/concepto según catálogo SIB

  @ApiPropertyOptional({
    description:
      'Código de exoneración del ISD (Impuesto a la Salida de Divisas) si aplica',
    example: 'EXE-001',
    type: String,
    maxLength: 10,
  })
  @IsOptional()
  @IsString()
  @MaxLength(10, { message: 'codigoExoneracionIsd máx 10 caracteres' })
  codigoExoneracionIsd?: string; // Código exoneración ISD (si aplica)

  @ApiPropertyOptional({
    description:
      'Tipo de comisión: OUR=Ordenante asume, BEN=Beneficiario asume, SHA=Compartida',
    example: 'SHA',
    enum: ['OUR', 'BEN', 'SHA'],
  })
  @IsOptional()
  @IsEnum(['OUR', 'BEN', 'SHA'], {
    message: 'tipoComision debe ser OUR, BEN o SHA',
  })
  tipoComision?: TipoComision;

  @ApiPropertyOptional({
    description: 'Referencia o concepto libre de la transferencia',
    example: 'REF-2026-001',
    type: String,
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'referencia máx 50 caracteres' })
  referencia?: string;
}

export class CrearTransferenciaLoteDto {
  @ApiProperty({
    description: 'Número de cuenta origen de la empresa ordenante',
    example: '1234567890',
    type: String,
  })
  @IsString()
  @IsNotEmpty({ message: 'cuentaEmpresa es requerida' })
  cuentaEmpresa: string;

  @ApiProperty({
    description: 'Referencia o identificador único del lote de transferencias',
    example: 'LOTE-TRANSF-2026-001',
    type: String,
    maxLength: 60,
  })
  @IsString()
  @IsNotEmpty({ message: 'referenciaLote es requerida' })
  @MaxLength(60, { message: 'referenciaLote máx 60 caracteres' })
  referenciaLote: string;

  @ApiProperty({
    description:
      'Listado de transferencias individuales que componen el lote (mínimo 1 elemento)',
    type: () => TransferenciaDetalleItemDto,
    isArray: true,
  })
  @IsArray({ message: 'detalles debe ser un arreglo' })
  @ArrayMinSize(1, { message: 'detalles debe tener al menos 1 elemento' })
  @ValidateNested({ each: true })
  @Type(() => TransferenciaDetalleItemDto)
  detalles: TransferenciaDetalleItemDto[];
}

export class GenerarTransferenciaPayloadDto {
  @ApiProperty({
    description:
      'Identificador numérico de la aplicación cliente que genera el lote',
    example: 123,
    type: Number,
  })
  @IsNumber({}, { message: 'idApp debe ser número' })
  @IsNotEmpty({ message: 'idApp es requerido' })
  idApp: number;

  @ApiProperty({
    description: 'Datos del lote de transferencias a generar',
    type: () => CrearTransferenciaLoteDto,
  })
  @ValidateNested()
  @Type(() => CrearTransferenciaLoteDto)
  data: CrearTransferenciaLoteDto;
}
