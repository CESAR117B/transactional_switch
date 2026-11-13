import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequireService } from './require-service.decorator';
import { AppService } from './app.service';
import { CrearPagoLoteDto } from './dto/crear-pago-lote.dto';
import { CrearTransferenciaLoteDto } from './dto/crear-transferencia-lote.dto';
import { ListarTransaccionesQueryDto } from './dto/listar-transacciones-query.dto';
import { RequestWithAppAuth } from './app-auth.types';
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
  @Post('transferencia-nacional')
  async generarPago(
    @Req() req: RequestWithAppAuth,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CrearPagoLoteDto,
  ) {
    const idApp = req.appAuth?.id_app;
    if (!idApp) {
      throw new BadRequestException(
        'No se pudo identificar la App desde el token',
      );
    }
    return this.appService.generarPago(
      idApp,
      dto,
      requerirIdempotencyKey(idempotencyKey),
    );
  }

  @ApiOperation({
    summary:
      'Generar lote de transferencias Produbanco (Aplica para bancos internacionales)',
  })
  @Post('transferencia-internacional')
  async generarTransferencia(
    @Req() req: RequestWithAppAuth,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CrearTransferenciaLoteDto,
  ) {
    const idApp = req.appAuth?.id_app;
    if (!idApp) {
      throw new BadRequestException(
        'No se pudo identificar la App desde el token',
      );
    }
    return this.appService.generarTransferencia(
      idApp,
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
    @Req() req: RequestWithAppAuth,
    @Query() query: ListarTransaccionesQueryDto,
  ) {
    const idApp = req.appAuth?.id_app;
    if (!idApp) {
      throw new BadRequestException(
        'No se pudo identificar la App desde el token',
      );
    }
    const llave = extraerLlaveEncriptacion(req);
    return this.appService.consultarTransacciones(idApp, query, llave);
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
    @Req() req: RequestWithAppAuth,
    @Param('dato') dato: string,
  ) {
    const idApp = req.appAuth?.id_app;
    if (!idApp) {
      throw new BadRequestException(
        'No se pudo identificar la App desde el token',
      );
    }
    if (!dato || !dato.trim()) {
      throw new BadRequestException(
        'dato es requerido (idTransaccion o referenciaLote)',
      );
    }
    const llave = extraerLlaveEncriptacion(req);
    return this.appService.consultarEstadoTransaccion(idApp, dato.trim(), llave);
  }
}

/** Lee el header X-Encryption-Key; lanza 400 si falta o está vacío. */
function extraerLlaveEncriptacion(req: RequestWithAppAuth): string {
  const raw = req.headers?.['x-encryption-key'];
  const llave = Array.isArray(raw) ? raw[0] : raw;
  if (typeof llave !== 'string' || llave.trim() === '') {
    throw new BadRequestException(
      'Falta el header X-Encryption-Key (encryptionKey de la app, 32 caracteres)',
    );
  }
  return llave.trim();
}

