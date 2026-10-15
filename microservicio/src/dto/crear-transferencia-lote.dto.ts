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
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export type TipoComision = 'OUR' | 'BEN' | 'SHA'; // OUR: Corre por cuenta del ordenante, BEN: Beneficiario, SHA: Compartido
export type TipoIdentificacion = 'C' | 'R' | 'P'; // C: Cédula, R: RUC, P: Pasaporte
export type TipoCuentaBanco = 'CTE' | 'AHO'; // CTE: Corriente, AHO: Ahorros

export class TransferenciaDetalleItemDto {
  @IsEnum(['C', 'R', 'P'], { message: 'tipoId debe ser C, R o P' })
  tipoId: TipoIdentificacion;

  @IsString()
  @IsNotEmpty({ message: 'identificacion es requerida' })
  @Length(5, 13, { message: 'identificacion entre 5 y 13 caracteres' })
  identificacion: string; // F12/F13 Tipo y Número ID beneficiario (obligatorio)

  @IsEnum(['CTE', 'AHO'], {
    message: 'tipoCuenta debe ser CTE o AHO',
  })
  tipoCuenta: TipoCuentaBanco; // F10 Tipo de cuenta destino (obligatorio)

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'comprobante máx 20 caracteres' })
  comprobante?: string; // F4 Comprobante de pago (opcional)

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'moneda debe ser ISO-3 mayúsculas (ej: USD, EUR)',
  })
  moneda?: string; // F6 Moneda (opcional, default USD)

  @IsString()
  @IsNotEmpty({ message: 'motivoTransferencia es requerido' })
  @Matches(/^\d{1,3},\d{1,2}$/, {
    message:
      'motivoTransferencia debe ser "codigo,ejencion" (ej: 106,0) según catálogo SIB',
  })
  motivoTransferencia: string; // F24 Motivo de la transferencia + código de exención

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
  @Matches(/^[A-Z0-9]{8,11}$/, {
    message: 'codigoSwiftAba debe ser SWIFT/BIC 8-11 alfanumérico mayúsculas',
  })
  codigoSwiftAba: string; // Código SWIFT (BIC) o ABA del banco destino

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{8,11}$/, {
    message: 'bancoIntermediarioSwift debe ser SWIFT 8-11',
  })
  bancoIntermediarioSwift?: string; // Opcional: SWIFT del banco intermediario

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'monto debe ser numérico con máx 2 decimales' },
  )
  @IsPositive({ message: 'monto debe ser positivo' })
  monto: number;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'conceptoInvisibles máx 100 caracteres' })
  conceptoInvisibles?: string; // Informativo; la trama usa RFB fijo PAGO!COMERCIAL!

  @IsOptional()
  @IsString()
  @MaxLength(10, { message: 'codigoExoneracionIsd máx 10 caracteres' })
  codigoExoneracionIsd?: string; // Código exoneración ISD (si aplica)

  @IsOptional()
  @IsEnum(['OUR', 'BEN', 'SHA'], {
    message: 'tipoComision debe ser OUR, BEN o SHA',
  })
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

  @IsEnum(['CTE', 'AHO'], { message: 'tipoCuentaEmpresa debe ser CTE o AHO' })
  tipoCuentaEmpresa: TipoCuentaBanco;

  @IsString()
  @IsNotEmpty({ message: 'empresa es requerida' })
  empresa: string; // Razón social de la empresa ordenante

  @IsString()
  @IsNotEmpty({ message: 'idEmpresa es requerida' })
  idEmpresa: string; // ID asignado por Produbanco

  @IsString()
  @IsNotEmpty({ message: 'servicio es requerido' })
  servicio: string; // Código de servicio de exterior (confirmar con Produbanco)

  @IsString()
  @IsNotEmpty({ message: 'idServicio es requerido' })
  idServicio: string; // ID de servicio de exterior (confirmar con Produbanco)

  // Interno: lo genera el back (NOMBREAPP-{secuencia}-{timestamp}-{hex});
  // no se envía en el request (ValidationPipe whitelist la trunca).
  referenciaLote?: string;

  @IsString()
  @Matches(/^\d{2}\/\d{2}\/\d{4}$/, {
    message: 'fechaInicio debe tener el formato DD/MM/YYYY',
  })
  fechaInicio: string;

  @IsString()
  @Matches(/^\d{2}\/\d{2}\/\d{4}$/, {
    message: 'fechaVencimiento debe tener el formato DD/MM/YYYY',
  })
  fechaVencimiento: string;

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
