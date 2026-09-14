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
  IsEmail,
} from 'class-validator';
import { Type } from 'class-transformer';

export type TipoIdentificacion = 'C' | 'R' | 'P'; // C: Cédula, R: RUC, P: Pasaporte
export type FormaPago = 'CTA' | 'SPI' | 'CHQ' | 'EFE'; // CTA: Produbanco, SPI: Otro Banco, CHQ: Cheque, EFE: Ventanilla
export type TipoCuenta = 'CTE' | 'AHO' | 'TAR'; // CTE: Corriente, AHO: Ahorros, TAR: Tarjeta

export class PagoDetalleItemDto {
  @ApiProperty({
    description: 'Número secuencial del pago dentro del lote',
    example: 1,
    type: Number,
    minimum: 1,
  })
  @IsInt({ message: 'secuencia debe ser entero' })
  @Min(1, { message: 'secuencia debe ser >= 1' })
  secuencia: number;

  @ApiProperty({
    description: 'Tipo de identificación del beneficiario: C=Cédula, R=RUC, P=Pasaporte',
    example: 'C',
    enum: ['C', 'R', 'P'],
  })
  @IsEnum(['C', 'R', 'P'], { message: 'tipoId debe ser C, R o P' })
  tipoId: TipoIdentificacion;

  @ApiProperty({
    description: 'Número de identificación del beneficiario',
    example: '1723456789',
    type: String,
    minLength: 5,
    maxLength: 20,
  })
  @IsString()
  @IsNotEmpty({ message: 'identificacion es requerida' })
  @Length(5, 20, { message: 'identificacion entre 5 y 20 caracteres' })
  identificacion: string;

  @ApiProperty({
    description: 'Nombre completo o razón social del beneficiario',
    example: 'Juan Pérez',
    type: String,
    minLength: 3,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty({ message: 'nombre es requerido' })
  @Length(3, 100, { message: 'nombre entre 3 y 100 caracteres' })
  nombre: string;

  @ApiProperty({
    description: 'Forma de pago: CTA=Cuenta Produbanco, SPI=Otro banco, CHQ=Cheque, EFE=Ventanilla',
    example: 'CTA',
    enum: ['CTA', 'SPI', 'CHQ', 'EFE'],
  })
  @IsEnum(['CTA', 'SPI', 'CHQ', 'EFE'], {
    message: 'formaPago debe ser CTA, SPI, CHQ o EFE',
  })
  formaPago: FormaPago;

  @ApiPropertyOptional({
    description: 'Tipo de cuenta destino: CTE=Corriente, AHO=Ahorros, TAR=Tarjeta. Requerido para CTA y SPI',
    example: 'AHO',
    enum: ['CTE', 'AHO', 'TAR'],
  })
  @IsOptional()
  @IsEnum(['CTE', 'AHO', 'TAR'], { message: 'tipoCuenta debe ser CTE, AHO o TAR' })
  tipoCuenta?: TipoCuenta;

  @ApiPropertyOptional({
    description: 'Número de cuenta bancaria destino del beneficiario. Requerido para CTA y SPI',
    example: '12345678901234',
    type: String,
    minLength: 5,
    maxLength: 34,
  })
  @IsOptional()
  @IsString()
  @Length(5, 34, { message: 'cuenta entre 5 y 34 caracteres' })
  cuenta?: string;

  @ApiPropertyOptional({
    description: 'Código de la institución financiera destino (ej: 0036 para Produbanco)',
    example: '0036',
    type: String,
    minLength: 2,
    maxLength: 10,
  })
  @IsOptional()
  @IsString()
  @Length(2, 10, { message: 'bancoCodigo entre 2 y 10 caracteres' })
  bancoCodigo?: string;

  @ApiProperty({
    description: 'Monto a pagar al beneficiario con máximo 2 decimales',
    example: 150.75,
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
    description: 'Número de factura, concepto o referencia del pago (Obligatorio)',
    example: 'FAC-00123',
    type: String,
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty({ message: 'referencia es requerida' })
  @MaxLength(200, { message: 'referencia máx 200 caracteres' })
  referencia: string;

  @ApiPropertyOptional({
    description: 'Correo electrónico para notificación de pago',
    example: 'jperez@email.com',
    type: String,
  })
  @IsOptional()
  @IsEmail({}, { message: 'email debe ser un correo válido' })
  email?: string;

  @ApiPropertyOptional({
    description: 'Número comprobante interno',
    example: 'COMP-001',
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'comprobante máx 20 caracteres' })
  comprobante?: string;
}

export class CrearPagoLoteDto {
  @ApiProperty({
    description: 'Número de cuenta origen de la empresa ordenante',
    example: '12040640308',
    type: String,
  })
  @IsString()
  @IsNotEmpty({ message: 'cuentaEmpresa es requerida' })
  cuentaEmpresa: string;

  @ApiPropertyOptional({
    description: 'Tipo de cuenta empresa: CTE=Corriente, AHO=Ahorros',
    example: 'AHO',
    enum: ['CTE', 'AHO'],
  })
  @IsOptional()
  @IsEnum(['CTE', 'AHO'], { message: 'tipoCuentaEmpresa debe ser CTE o AHO' })
  tipoCuentaEmpresa?: TipoCuenta;

  @ApiPropertyOptional({ description: 'Razón social empresa ordenante', example: 'Mi Empresa S.A.' })
  @IsOptional()
  @IsString()
  empresa?: string;

  @ApiPropertyOptional({ description: 'ID empresa Produbanco', example: '343' })
  @IsOptional()
  @IsString()
  idEmpresa?: string;

  @ApiPropertyOptional({ description: 'Código servicio Produbanco', example: 'PV' })
  @IsOptional()
  @IsString()
  servicio?: string;

  @ApiPropertyOptional({ description: 'ID servicio Produbanco', example: '75' })
  @IsOptional()
  @IsString()
  idServicio?: string;

  @ApiPropertyOptional({ description: 'Fecha inicio DD/MM/YYYY', example: '01/01/2026' })
  @IsOptional()
  @IsString()
  fechaInicio?: string;

  @ApiPropertyOptional({ description: 'Fecha vencimiento DD/MM/YYYY', example: '31/01/2026' })
  @IsOptional()
  @IsString()
  fechaVencimiento?: string;

  @ApiProperty({
    description: 'Referencia o identificador único del lote de pagos',
    example: 'LOTE-2026-001',
    type: String,
    maxLength: 60,
  })
  @IsString()
  @IsNotEmpty({ message: 'referenciaLote es requerida' })
  @MaxLength(60, { message: 'referenciaLote máx 60 caracteres' })
  referenciaLote: string;

  @ApiProperty({
    description: 'Listado de pagos individuales que componen el lote',
    type: () => PagoDetalleItemDto,
    isArray: true,
  })
  @IsArray({ message: 'detalles debe ser un arreglo' })
  @ArrayMinSize(1, { message: 'detalles debe tener al menos 1 elemento' })
  @ValidateNested({ each: true })
  @Type(() => PagoDetalleItemDto)
  detalles: PagoDetalleItemDto[];
}

export class GenerarPagoPayloadDto {
  @ApiProperty({
    description: 'Identificador numérico de la aplicación cliente que genera el lote',
    example: 123,
    type: Number,
  })
  @IsNumber({}, { message: 'idApp debe ser número' })
  @IsNotEmpty({ message: 'idApp es requerido' })
  idApp: number;

  @ApiProperty({
    description: 'Datos del lote de pagos a generar',
    type: () => CrearPagoLoteDto,
  })
  @ValidateNested()
  @Type(() => CrearPagoLoteDto)
  data: CrearPagoLoteDto;
}