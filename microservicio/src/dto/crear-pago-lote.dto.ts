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
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export type TipoIdentificacion = 'C' | 'R' | 'P'; // C: Cédula, R: RUC, P: Pasaporte
export type FormaPago = 'CTA' | 'SPI' | 'CHQ' | 'EFE'; // CTA: Produbanco, SPI: Otro Banco, CHQ: Cheque, EFE: Ventanilla
export type TipoCuenta = 'CTE' | 'AHO' | 'TAR'; // CTE: Corriente, AHO: Ahorros, TAR: Tarjeta

export class PagoDetalleItemDto {
  @IsInt({ message: 'secuencia debe ser entero' })
  @Min(1, { message: 'secuencia debe ser >= 1' })
  secuencia: number;

  @IsEnum(['C', 'R', 'P'], { message: 'tipoId debe ser C, R o P' })
  tipoId: TipoIdentificacion;

  @IsString()
  @IsNotEmpty({ message: 'identificacion es requerida' })
  @Length(5, 20, { message: 'identificacion entre 5 y 20 caracteres' })
  identificacion: string;

  @IsString()
  @IsNotEmpty({ message: 'nombre es requerido' })
  @Length(3, 100, { message: 'nombre entre 3 y 100 caracteres' })
  nombre: string;

  @IsEnum(['CTA', 'SPI', 'CHQ', 'EFE'], { message: 'formaPago debe ser CTA, SPI, CHQ o EFE' })
  formaPago: FormaPago;

  @IsOptional()
  @IsEnum(['CTE', 'AHO', 'TAR'], { message: 'tipoCuenta debe ser CTE, AHO o TAR' })
  tipoCuenta?: TipoCuenta; // Requerido para CTA y SPI

  @IsOptional()
  @IsString()
  @Length(5, 34, { message: 'cuenta entre 5 y 34 caracteres' })
  cuenta?: string; // Requerido para CTA y SPI

  @IsOptional()
  @IsString()
  @Length(2, 10, { message: 'bancoCodigo entre 2 y 10 caracteres' })
  bancoCodigo?: string; // Código de banco destino (ej: "0036" para Produbanco)

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'monto debe ser numérico con máx 2 decimales' })
  @IsPositive({ message: 'monto debe ser positivo' })
  monto: number;

  @IsString()
  @IsNotEmpty({ message: 'referencia es requerida' })
  @MaxLength(200, { message: 'referencia máx 200 caracteres' })
  referencia: string; // Número de factura o concepto (Obligatorio en Produbanco)

  @IsOptional()
  @IsEmail({}, { message: 'email debe ser un correo válido' })
  @MaxLength(100, { message: 'email máx 100 caracteres' })
  email?: string; // Correo para notificación al beneficiario

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'comprobante máx 20 caracteres' })
  comprobante?: string; // Número de egreso o comprobante interno
}

export class CrearPagoLoteDto {
  @IsString()
  @IsNotEmpty({ message: 'cuentaEmpresa es requerida' })
  cuentaEmpresa: string;

  @IsOptional()
  @IsEnum(['CTE', 'AHO'], { message: 'tipoCuentaEmpresa debe ser CTE o AHO' })
  tipoCuentaEmpresa?: TipoCuenta;

  @IsOptional()
  @IsString()
  empresa?: string; // Razón social de la empresa ordenante

  @IsOptional()
  @IsString()
  idEmpresa?: string; // ID asignado por Produbanco (ej: "343")

  @IsOptional()
  @IsString()
  servicio?: string; // Código de servicio (ej: "PV")

  @IsOptional()
  @IsString()
  idServicio?: string; // ID de servicio asignado por Produbanco (ej: "75")

  @IsString()
  @IsNotEmpty({ message: 'referenciaLote es requerida' })
  @MaxLength(60, { message: 'referenciaLote máx 60 caracteres' })
  referenciaLote: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}\/\d{2}\/\d{4}$/, { message: 'fechaInicio debe tener el formato DD/MM/YYYY' })
  fechaInicio?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}\/\d{2}\/\d{4}$/, { message: 'fechaVencimiento debe tener el formato DD/MM/YYYY' })
  fechaVencimiento?: string;

  @IsArray({ message: 'detalles debe ser un arreglo' })
  @ArrayMinSize(1, { message: 'detalles debe tener al menos 1 elemento' })
  @ValidateNested({ each: true })
  @Type(() => PagoDetalleItemDto)
  detalles: PagoDetalleItemDto[];
}

export class GenerarPagoPayloadDto {
  @IsNumber({}, { message: 'idApp debe ser número' })
  @IsNotEmpty({ message: 'idApp es requerido' })
  idApp: number;

  @ValidateNested()
  @Type(() => CrearPagoLoteDto)
  data: CrearPagoLoteDto;
}