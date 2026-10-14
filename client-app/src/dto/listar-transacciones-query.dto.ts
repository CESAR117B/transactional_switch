import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

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
}
