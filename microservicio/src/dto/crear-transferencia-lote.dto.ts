import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsPositive,
  IsEnum,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  Max,
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
  @IsEnum(['C', 'R', 'P'], { message: 'tipo_id debe ser C, R o P' })
  tipo_id: TipoIdentificacion;

  @IsString()
  @IsNotEmpty({ message: 'identificacion es requerida' })
  @Length(5, 13, { message: 'identificacion entre 5 y 13 caracteres' })
  identificacion: string; // F12/F13 Tipo y Número ID beneficiario (obligatorio)

  @IsEnum(['CTE', 'AHO'], {
    message: 'tipo_cuenta debe ser CTE o AHO',
  })
  tipo_cuenta: TipoCuentaBanco; // F10 Tipo de cuenta destino (obligatorio)

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
  @IsNotEmpty({ message: 'motivo_transferencia es requerido' })
  @Matches(/^\d{1,3},\d{1,2}$/, {
    message:
      'motivo_transferencia debe ser "codigo,ejencion" (ej: 106,0) según catálogo SIB',
  })
  motivo_transferencia: string; // F24 Motivo de la transferencia + código de exención

  @IsString()
  @IsNotEmpty({ message: 'beneficiario_nombre es requerido' })
  @Length(3, 100, { message: 'beneficiario_nombre entre 3 y 100 caracteres' })
  beneficiario_nombre: string;

  @IsString()
  @IsNotEmpty({ message: 'beneficiario_direccion es requerida' })
  @Length(3, 100, { message: 'beneficiario_direccion entre 3 y 100 caracteres' })
  beneficiario_direccion: string;

  @IsString()
  @IsNotEmpty({ message: 'beneficiario_cuenta es requerida' })
  @Length(5, 34, { message: 'beneficiario_cuenta entre 5 y 34 caracteres' })
  beneficiario_cuenta: string; // IBAN o Número de Cuenta Internacional

  @IsString()
  @IsNotEmpty({ message: 'banco_destino_nombre es requerido' })
  @Length(3, 100, { message: 'banco_destino_nombre entre 3 y 100 caracteres' })
  banco_destino_nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'banco_destino_direccion máx 100 caracteres' })
  banco_destino_direccion?: string;

  @IsString()
  @IsNotEmpty({ message: 'codigo_swift_aba es requerido' })
  @Matches(/^[A-Z0-9]{8,11}$/, {
    message: 'codigo_swift_aba debe ser SWIFT/BIC 8-11 alfanumérico mayúsculas',
  })
  codigo_swift_aba: string; // Código SWIFT (BIC) o ABA del banco destino

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{8,11}$/, {
    message: 'banco_intermediario_swift debe ser SWIFT 8-11',
  })
  banco_intermediario_swift?: string; // Opcional: SWIFT del banco intermediario

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'monto debe ser numérico con máx 2 decimales' },
  )
  @IsPositive({ message: 'monto debe ser positivo' })
  @Max(99_999_999.99, {
    message: 'monto supera el máximo permitido por la trama (99.999.999,99)',
  })
  monto: number;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'concepto_invisibles máx 100 caracteres' })
  concepto_invisibles?: string; // Informativo; la trama usa RFB fijo PAGO!COMERCIAL!

  @IsOptional()
  @IsString()
  @MaxLength(10, { message: 'codigo_exoneracion_isd máx 10 caracteres' })
  codigo_exoneracion_isd?: string; // Código exoneración ISD (si aplica)

  @IsOptional()
  @IsEnum(['OUR', 'BEN', 'SHA'], {
    message: 'tipo_comision debe ser OUR, BEN o SHA',
  })
  tipo_comision?: TipoComision;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'referencia máx 50 caracteres' })
  referencia?: string;
}

export class CrearTransferenciaLoteDto {
  // Parametrización bancaria (cuentaEmpresa, tipoCuentaEmpresa, empresa e
  // idEmpresa) ya NO se envía: la inyecta el back desde
  // atributos_integraciones (getProdubancoConfig).

  @IsString()
  @IsNotEmpty({ message: 'servicio es requerido' })
  servicio: string; // Varía por operación (ej: servicio de exterior)

  @IsString()
  @IsNotEmpty({ message: 'id_servicio es requerido' })
  id_servicio: string; // ID de servicio de exterior asignado por Produbanco

  // Interno: lo genera el back (NOMBREAPP-{secuencia}-{timestamp}-{hex});
  // no se envía en el request (ValidationPipe whitelist la trunca).
  referencia_lote?: string;

  // fechaInicio/fechaVencimiento YA no se envían: el back genera la
  // vigencia del sobre (hoy → hoy + 1) en tramas-produbanco.service
  // (parametrizarTransferencia) y la incluye en el <Envelope> a Produbanco.

  @IsArray({ message: 'detalles debe ser un arreglo' })
  @ArrayMinSize(1, { message: 'detalles debe tener al menos 1 elemento' })
  @ArrayMaxSize(100, { message: 'detalles admite como máximo 100 elementos' })
  @ValidateNested({ each: true })
  @Type(() => TransferenciaDetalleItemDto)
  detalles: TransferenciaDetalleItemDto[];
}

export class GenerarTransferenciaPayloadDto {
  @IsNumber({}, { message: 'id_app debe ser número' })
  @IsNotEmpty({ message: 'id_app es requerido' })
  id_app: number;

  @IsString()
  @IsNotEmpty({ message: 'idempotency_key es requerida' })
  @MaxLength(100)
  idempotency_key: string;

  @ValidateNested()
  @Type(() => CrearTransferenciaLoteDto)
  data: CrearTransferenciaLoteDto;
}
