import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
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

  @IsEnum(['CTA', 'SPI', 'CHQ', 'EFE'], {
    message: 'formaPago debe ser CTA, SPI, CHQ o EFE',
  })
  formaPago: FormaPago;

  @IsOptional()
  @IsEnum(['CTE', 'AHO', 'TAR'], {
    message: 'tipoCuenta debe ser CTE, AHO o TAR',
  })
  tipoCuenta?: TipoCuenta; // Requerido para CTA y SPI

  @IsOptional()
  @IsString()
  @Length(5, 34, { message: 'cuenta entre 5 y 34 caracteres' })
  cuenta?: string; // Requerido para CTA y SPI

  @IsOptional()
  @IsString()
  @Length(2, 10, { message: 'bancoCodigo entre 2 y 10 caracteres' })
  bancoCodigo?: string; // Código de banco destino (ej: "0036" para Produbanco)

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'monto debe ser numérico con máx 2 decimales' },
  )
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
  // Parametrización bancaria (cuentaEmpresa, tipoCuentaEmpresa, empresa e
  // idEmpresa) ya NO se envía: la inyecta el back desde
  // atributos_integraciones (getProdubancoConfig).

  @IsString()
  @IsNotEmpty({ message: 'servicio es requerido' })
  servicio: string; // Varía por operación (ej: "PV" pago interbancario)

  @IsString()
  @IsNotEmpty({ message: 'idServicio es requerido' })
  idServicio: string; // ID de servicio asignado por Produbanco (ej: "75")

  // Interno: lo genera el back (NOMBREAPP-{secuencia}-{timestamp}-{hex});
  // no se envía en el request (ValidationPipe whitelist la trunca).
  referenciaLote?: string;

  // fechaInicio/fechaVencimiento YA no se envían: el back genera la
  // vigencia del sobre (hoy → hoy + 1) en TramasProdubanco.service
  // (parametrizarPago) y la incluye en el <Envelope> a Produbanco.

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
