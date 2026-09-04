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
} from 'class-validator';
import { Type } from 'class-transformer';

export type TipoIdentificacion = 'C' | 'R' | 'P'; // C: Cédula, R: RUC, P: Pasaporte
export type FormaPago = 'CTA' | 'SPI' | 'CHQ' | 'EFE'; // CTA: Produbanco, SPI: Otro Banco, CHQ: Cheque, EFE: Ventanilla

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
  @IsString()
  @Length(5, 34, { message: 'cuenta entre 5 y 34 caracteres' })
  cuenta?: string;

  @IsOptional()
  @IsString()
  @Length(2, 10, { message: 'bancoCodigo entre 2 y 10 caracteres' })
  bancoCodigo?: string; // Código de banco destino para SPI (ej: "0036")

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'monto debe ser numérico con máx 2 decimales' })
  @IsPositive({ message: 'monto debe ser positivo' })
  monto: number;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'referencia máx 50 caracteres' })
  referencia?: string; // Número de factura o concepto
}

export class CrearPagoLoteDto {
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
