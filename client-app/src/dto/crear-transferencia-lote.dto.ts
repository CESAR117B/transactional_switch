import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({
    description: 'Tipo de identificación del beneficiario',
    example: 'C',
    enum: ['C', 'R', 'P'],
  })
  @IsEnum(['C', 'R', 'P'], { message: 'tipo_id debe ser C, R o P' })
  tipo_id: TipoIdentificacion;

  @ApiProperty({
    description:
      'Número de identificación del beneficiario (cédula 10, RUC 13, pasaporte hasta 13)',
    example: '1723456789',
    type: String,
    minLength: 5,
    maxLength: 13,
  })
  @IsString()
  @IsNotEmpty({ message: 'identificacion es requerida' })
  @Length(5, 13, { message: 'identificacion entre 5 y 13 caracteres' })
  identificacion: string; // F12/F13 Tipo y Número ID beneficiario (obligatorio)

  @ApiProperty({
    description: 'Tipo de cuenta destino del beneficiario',
    example: 'CTE',
    enum: ['CTE', 'AHO'],
  })
  @IsEnum(['CTE', 'AHO'], {
    message: 'tipo_cuenta debe ser CTE o AHO',
  })
  tipo_cuenta: TipoCuentaBanco; // F10 Tipo de cuenta destino (obligatorio)

  @ApiPropertyOptional({
    description: 'Comprobante de pago (egreso, planilla, etc.)',
    example: 'COMP-001',
    type: String,
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'comprobante máx 20 caracteres' })
  comprobante?: string; // F4 Comprobante de pago (opcional)

  @ApiPropertyOptional({
    description: 'Código de moneda ISO-3 (default USD)',
    example: 'USD',
    type: String,
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'moneda debe ser ISO-3 mayúsculas (ej: USD, EUR)',
  })
  moneda?: string; // F6 Moneda (opcional, default USD)

  @ApiProperty({
    description:
      'Motivo de la transferencia según catálogo SIB, seguido de coma y código de exención (0 = sin exención)',
    example: '106,0',
    type: String,
    pattern: '^\\d{1,3},\\d{1,2}$',
  })
  @IsString()
  @IsNotEmpty({ message: 'motivo_transferencia es requerido' })
  @Matches(/^\d{1,3},\d{1,2}$/, {
    message:
      'motivo_transferencia debe ser "codigo,ejencion" (ej: 106,0) según catálogo SIB',
  })
  motivo_transferencia: string; // F24 Motivo de la transferencia + código de exención

  @ApiProperty({
    description: 'Nombre completo o razón social del beneficiario',
    example: 'John Smith',
    type: String,
    minLength: 3,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty({ message: 'beneficiario_nombre es requerido' })
  @Length(3, 100, { message: 'beneficiario_nombre entre 3 y 100 caracteres' })
  beneficiario_nombre: string;

  @ApiProperty({
    description: 'Dirección completa del beneficiario',
    example: '123 Main St, New York, NY 10001, USA',
    type: String,
    minLength: 3,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty({ message: 'beneficiario_direccion es requerida' })
  @Length(3, 100, { message: 'beneficiario_direccion entre 3 y 100 caracteres' })
  beneficiario_direccion: string;

  @ApiProperty({
    description: 'Número de cuenta o IBAN del beneficiario',
    example: 'DE89370400440532013000',
    type: String,
    minLength: 5,
    maxLength: 34,
  })
  @IsString()
  @IsNotEmpty({ message: 'beneficiario_cuenta es requerida' })
  @Length(5, 34, { message: 'beneficiario_cuenta entre 5 y 34 caracteres' })
  beneficiario_cuenta: string; // IBAN o Número de Cuenta Internacional

  @ApiProperty({
    description:
      'Nombre del banco destino donde se acreditará la transferencia',
    example: 'Citibank N.A.',
    type: String,
    minLength: 3,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty({ message: 'banco_destino_nombre es requerido' })
  @Length(3, 100, { message: 'banco_destino_nombre entre 3 y 100 caracteres' })
  banco_destino_nombre: string;

  @ApiPropertyOptional({
    description: 'Dirección del banco destino',
    example: '111 Wall Street, New York, NY 10043, USA',
    type: String,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'banco_destino_direccion máx 100 caracteres' })
  banco_destino_direccion?: string;

  @ApiProperty({
    description:
      'Código SWIFT/BIC (8-11 caracteres alfanuméricos en mayúsculas) o ABA del banco destino',
    example: 'CITIUS33',
    type: String,
    pattern: '^[A-Z0-9]{8,11}$',
  })
  @IsString()
  @IsNotEmpty({ message: 'codigo_swift_aba es requerido' })
  @Matches(/^[A-Z0-9]{8,11}$/, {
    message: 'codigo_swift_aba debe ser SWIFT/BIC 8-11 alfanumérico mayúsculas',
  })
  codigo_swift_aba: string; // Código SWIFT (BIC) o ABA del banco destino

  @ApiPropertyOptional({
    description: 'Código SWIFT/BIC del banco intermediario (cuando aplica)',
    example: 'BOFAUS3N',
    type: String,
    pattern: '^[A-Z0-9]{8,11}$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{8,11}$/, {
    message: 'banco_intermediario_swift debe ser SWIFT 8-11',
  })
  banco_intermediario_swift?: string; // Opcional: SWIFT del banco intermediario

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
  @Max(99_999_999.99, {
    message: 'monto supera el máximo permitido por la trama (99.999.999,99)',
  })
  monto: number;

  @ApiPropertyOptional({
    description:
      'Concepto informativo del pago (la trama usa RFB fijo PAGO!COMERCIAL!COMISIÓN)',
    example: 'PAGO_PROVEEDOR',
    type: String,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'concepto_invisibles máx 100 caracteres' })
  concepto_invisibles?: string; // Informativo; la trama usa RFB fijo PAGO!COMERCIAL!

  @ApiPropertyOptional({
    description:
      'Código de exoneración del ISD (Impuesto a la Salida de Divisas) si aplica',
    example: 'EXE-001',
    type: String,
    maxLength: 10,
  })
  @IsOptional()
  @IsString()
  @MaxLength(10, { message: 'codigo_exoneracion_isd máx 10 caracteres' })
  codigo_exoneracion_isd?: string; // Código exoneración ISD (si aplica)

  @ApiPropertyOptional({
    description:
      'Tipo de comisión: OUR=Ordenante asume, BEN=Beneficiario asume, SHA=Compartida',
    example: 'SHA',
    enum: ['OUR', 'BEN', 'SHA'],
  })
  @IsOptional()
  @IsEnum(['OUR', 'BEN', 'SHA'], {
    message: 'tipo_comision debe ser OUR, BEN o SHA',
  })
  tipo_comision?: TipoComision;

  @ApiPropertyOptional({
    description:
      'Número de factura o referencia del documento generado por el sistema ' +
      'cliente que se conecta al microservicio; se envía a Produbanco en el ' +
      'campo INV (F23, máx 26 chars sin espacios). Si no se envía, el back ' +
      'usa la referencia_lote generada por el back',
    example: 'FAC-00123',
    type: String,
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'referencia máx 50 caracteres' })
  referencia?: string;
}

export class CrearTransferenciaLoteDto {
  // Parametrización bancaria (cuentaEmpresa, tipoCuentaEmpresa, empresa e
  // idEmpresa) ya NO se envía desde el cliente: la inyecta el microservicio
  // desde su config (atributos_integraciones). servicio/id_servicio sí se
  // envían porque varían entre pago interbancario y pago al exterior.

  @ApiProperty({
    description:
      'Código de servicio Produbanco; varía por operación (ej: servicio de exterior)',
    example: 'PE',
    type: String,
  })
  @IsString()
  @IsNotEmpty({ message: 'servicio es requerido' })
  servicio: string;

  @ApiProperty({
    description: 'ID de servicio asignado por Produbanco para el exterior',
    example: '80',
    type: String,
  })
  @IsString()
  @IsNotEmpty({ message: 'id_servicio es requerido' })
  id_servicio: string;

  // fechaInicio/fechaVencimiento YA no se envían al microservicio: el back
  // genera la vigencia del sobre (hoy → hoy + 1) y la incluye en el
  // <Envelope> a Produbanco (tramas-produbanco.service).

  @ApiProperty({
    description:
      'Listado de transferencias individuales que componen el lote (mínimo 1 elemento)',
    type: () => TransferenciaDetalleItemDto,
    isArray: true,
  })
  @IsArray({ message: 'detalles debe ser un arreglo' })
  @ArrayMinSize(1, { message: 'detalles debe tener al menos 1 elemento' })
  @ArrayMaxSize(100, { message: 'detalles admite como máximo 100 elementos' })
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
  @IsNumber({}, { message: 'id_app debe ser número' })
  @IsNotEmpty({ message: 'id_app es requerido' })
  id_app: number;

  @ApiProperty({
    description: 'Datos del lote de transferencias a generar',
    type: () => CrearTransferenciaLoteDto,
  })
  @ValidateNested()
  @Type(() => CrearTransferenciaLoteDto)
  data: CrearTransferenciaLoteDto;
}
