import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { ListarTransaccionesQueryDto } from './listar-transacciones-query.dto';

/**
 * Filtros del listado admin de transacciones Produbanco: los mismos del
 * listado cliente (paginación, estado, operación, fechas y beneficiario)
 * más `idApp` opcional para acotar a una app.
 *
 * Nota: `cedula` y/o `cuenta` requieren `idApp`, porque el hash de búsqueda
 * se calcula con la encryptionKey de esa app (el servicio responde 400 si
 * falta).
 */
export class ListarTransaccionesAdminQueryDto extends ListarTransaccionesQueryDto {
  @ApiPropertyOptional({
    description:
      'ID de la app a consultar. Sin valor: todas las apps registradas.',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idApp?: number;
}
