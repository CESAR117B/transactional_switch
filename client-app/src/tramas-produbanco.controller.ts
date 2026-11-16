import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequireService } from './require-service.decorator';
import { AppService } from './app.service';
import { AppAuth, AppAuthConId } from './app-auth.decorator';
import { CrearPagoLoteDto } from './dto/crear-pago-lote.dto';
import { CrearTransferenciaLoteDto } from './dto/crear-transferencia-lote.dto';
import { ListarTransaccionesQueryDto } from './dto/listar-transacciones-query.dto';
import { requerirIdempotencyKey } from './idempotency-key';

@ApiTags('Servicios')
@ApiBearerAuth()
@RequireService('SPR_PRODUBANCO')
@Controller('tramas-produbanco')
export class TramasProdubancoController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({
    summary:
      'Generar lote de pagos Produbanco (trama directa para bancos nacionales)',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'UUID único por operación (máx. 100 caracteres). Reutilizalo exactamente igual en cada reintento para evitar pagos duplicados.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @Post('transferencia-nacional')
  async generarPago(
    @AppAuth() auth: AppAuthConId,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CrearPagoLoteDto,
  ) {
    return this.appService.generarPago(
      auth.id_app,
      dto,
      requerirIdempotencyKey(idempotencyKey),
    );
  }

  @ApiOperation({
    summary:
      'Generar lote de transferencias Produbanco (Aplica para bancos internacionales)',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'UUID único por operación (máx. 100 caracteres). Reutilizalo exactamente igual en cada reintento para evitar transferencias duplicadas.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @Post('transferencia-internacional')
  async generarTransferencia(
    @AppAuth() auth: AppAuthConId,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CrearTransferenciaLoteDto,
  ) {
    return this.appService.generarTransferencia(
      auth.id_app,
      dto,
      requerirIdempotencyKey(idempotencyKey),
    );
  }

  @ApiOperation({
    summary:
      'Listar transacciones de Produbanco de la App (paginado, estado local); ' +
      'excluye operaciones de otros servicios. Requiere el header ' +
      'X-Encryption-Key para desencriptar la data.',
  })
  @ApiHeader({
    name: 'X-Encryption-Key',
    description:
      'EncryptionKey de la app (32 chars). Se valida contra BD y se usa para ' +
      'desencriptar la respuesta.',
    required: true,
  })
  @Get('transacciones')
  async listarTransacciones(
    @AppAuth() auth: AppAuthConId,
    @Headers('x-encryption-key') llaveRaw: string | string[] | undefined,
    @Query() query: ListarTransaccionesQueryDto,
  ) {
    return this.appService.consultarTransacciones(
      auth.id_app,
      query,
      extraerLlaveEncriptacion(llaveRaw),
    );
  }

  @ApiOperation({
    summary:
      'Estado de una transacción de Produbanco por un único campo (id o ' +
      'referenciaLote): local + banco en vivo + actualización automática en ' +
      'BD; operaciones de otros servicios → 404. Requiere el header ' +
      'X-Encryption-Key para desencriptar la data.',
  })
  @ApiHeader({
    name: 'X-Encryption-Key',
    description:
      'EncryptionKey de la app (32 chars). Se valida contra BD y se usa para ' +
      'desencriptar la respuesta.',
    required: true,
  })
  @Get('transacciones/estado/:dato')
  async estadoTransaccion(
    @AppAuth() auth: AppAuthConId,
    @Headers('x-encryption-key') llaveRaw: string | string[] | undefined,
    @Param('dato') dato: string,
  ) {
    if (!dato || !dato.trim()) {
      throw new BadRequestException(
        'dato es requerido (idTransaccion o referenciaLote)',
      );
    }
    return this.appService.consultarEstadoTransaccion(
      auth.id_app,
      dato.trim(),
      extraerLlaveEncriptacion(llaveRaw),
    );
  }
}

/** Lee el header X-Encryption-Key; lanza 400 si falta o está vacío. */
function extraerLlaveEncriptacion(
  raw: string | string[] | undefined,
): string {
  const llave = Array.isArray(raw) ? raw[0] : raw;
  if (typeof llave !== 'string' || llave.trim() === '') {
    throw new BadRequestException(
      'Falta el header X-Encryption-Key (encryptionKey de la app, 32 caracteres)',
    );
  }
  return llave.trim();
}
