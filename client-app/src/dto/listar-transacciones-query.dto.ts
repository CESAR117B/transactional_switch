import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';

export class ListarTransaccionesQueryDto {
  @ApiPropertyOptional({ description: 'Página (inicia en 1)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Registros por página (máximo 50)',
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;

  @ApiPropertyOptional({
    description: 'Filtrar por estado: 1=PENDIENTE, 2=PROCESADO_BANCO, 3=ERROR',
    enum: [1, 2, 3],
  })
  @IsOptional()
  @Type(() => Number)
  @IsIn([1, 2, 3])
  status?: number;

  @ApiPropertyOptional({
    description:
      'Operación a filtrar (solo Produbanco). Por defecto el listado incluye ' +
      'únicamente SPR_PRODUBANCO-PAGO y SPR_PRODUBANCO-TRANSFERENCIA_EXTERIOR',
    enum: ['SPR_PRODUBANCO-PAGO', 'SPR_PRODUBANCO-TRANSFERENCIA_EXTERIOR'],
  })
  @IsOptional()
  @IsIn(['SPR_PRODUBANCO-PAGO', 'SPR_PRODUBANCO-TRANSFERENCIA_EXTERIOR'])
  operation?: string;

  @ApiPropertyOptional({
    description:
      'Fecha inicial de creación del lote DD/MM/YYYY (día completo en horario ' +
      'Ecuador, inclusive)',
    example: '01/10/2026',
  })
  @IsOptional()
  @Matches(/^\d{2}\/\d{2}\/\d{4}$/, {
    message: 'fechaDesde debe tener el formato DD/MM/YYYY',
  })
  fechaDesde?: string;

  @ApiPropertyOptional({
    description:
      'Fecha final de creación del lote DD/MM/YYYY (día completo en horario ' +
      'Ecuador, inclusive)',
    example: '19/10/2026',
  })
  @IsOptional()
  @Matches(/^\d{2}\/\d{2}\/\d{4}$/, {
    message: 'fechaHasta debe tener el formato DD/MM/YYYY',
  })
  fechaHasta?: string;

  @ApiPropertyOptional({
    description:
      'Cédula/RUC/pasaporte del beneficiario (match exacto normalizado: sin ' +
      'espacios ni guiones, mayúsculas); transacciones cuyo lote contenga ' +
      'ese beneficiario',
    example: '1723456789',
  })
  @IsOptional()
  @IsString()
  @Length(5, 20, { message: 'cedula entre 5 y 20 caracteres' })
  cedula?: string;

  @ApiPropertyOptional({
    description:
      'Cuenta bancaria o IBAN del beneficiario (match exacto normalizado: sin ' +
      'espacios ni guiones, mayúsculas)',
    example: '0036001234567890',
  })
  @IsOptional()
  @IsString()
  @Length(5, 34, { message: 'cuenta entre 5 y 34 caracteres' })
  cuenta?: string;
}
