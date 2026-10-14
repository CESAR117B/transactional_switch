import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from './api-key.guard';
import { RequireService } from './require-service.decorator';
import { AppService } from './app.service';
import {
  CrearPagoLoteDto,
  GenerarPagoPayloadDto,
} from './dto/crear-pago-lote.dto';
import { CrearTransferenciaLoteDto } from './dto/crear-transferencia-lote.dto';
import { ListarTransaccionesQueryDto } from './dto/listar-transacciones-query.dto';

@ApiTags('Servicios')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@RequireService('SPR_PRODUBANCO')
@Controller('tramas-produbanco')
export class TramasProdubancoController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({ summary: 'Generar lote de pagos Produbanco (trama directa)' })
  @Post('pago')
  async generarPago(@Req() req: any, @Body() dto: CrearPagoLoteDto) {
    const idApp = req.appAuth?.id_app;
    if (!idApp) {
      throw new BadRequestException(
        'No se pudo identificar la App desde el token',
      );
    }
    return this.appService.generarPago(idApp, dto);
  }

  @ApiOperation({
    summary:
      'Generar lote de transferencias al exterior Produbanco (Transfer Full)',
  })
  @Post('transferencia')
  async generarTransferencia(
    @Req() req: any,
    @Body() dto: CrearTransferenciaLoteDto,
  ) {
    const idApp = req.appAuth?.id_app;
    if (!idApp) {
      throw new BadRequestException(
        'No se pudo identificar la App desde el token',
      );
    }
    return this.appService.generarTransferencia(idApp, dto);
  }

  @ApiOperation({
    summary: 'Listar transacciones de la App (paginado, estado local)',
  })
  @Get('transacciones')
  async listarTransacciones(
    @Req() req: ReqConAppAuth,
    @Query() query: ListarTransaccionesQueryDto,
  ) {
    const idApp = req.appAuth?.id_app;
    if (!idApp) {
      throw new BadRequestException(
        'No se pudo identificar la App desde el token',
      );
    }
    return this.appService.consultarTransacciones(idApp, query);
  }

  @ApiOperation({
    summary:
      'Estado de una transacción por referenciaLote (local + banco en vivo)',
  })
  @Get('transacciones/por-referencia/:referenciaLote')
  async estadoPorReferencia(
    @Req() req: ReqConAppAuth,
    @Param('referenciaLote') referenciaLote: string,
    @Query('movimientos') movimientos?: string,
  ) {
    const idApp = req.appAuth?.id_app;
    if (!idApp) {
      throw new BadRequestException(
        'No se pudo identificar la App desde el token',
      );
    }
    if (!referenciaLote) {
      throw new BadRequestException('referenciaLote es requerida');
    }
    return this.appService.consultarEstadoTransaccion(idApp, {
      referenciaLote,
      detalleMovimientos: movimientos !== '0' && movimientos !== 'false',
    });
  }

  @ApiOperation({
    summary: 'Estado de una transacción por id (local + banco en vivo)',
  })
  @Get('transacciones/:id')
  async estadoPorId(
    @Req() req: ReqConAppAuth,
    @Param('id') id: string,
    @Query('movimientos') movimientos?: string,
  ) {
    const idApp = req.appAuth?.id_app;
    if (!idApp) {
      throw new BadRequestException(
        'No se pudo identificar la App desde el token',
      );
    }
    if (!/^\d+$/.test(id)) {
      throw new BadRequestException('idTransaccion debe ser un número entero');
    }
    return this.appService.consultarEstadoTransaccion(idApp, {
      idTransaccion: id,
      detalleMovimientos: movimientos !== '0' && movimientos !== 'false',
    });
  }
}

interface ReqConAppAuth {
  appAuth?: { id_app?: number };
}
