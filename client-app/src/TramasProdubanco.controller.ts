import { BadRequestException, Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiKeyGuard } from './api-key.guard';
import { RequireService } from "./require-service.decorator";
import { AppService } from "./app.service";
import { CrearPagoLoteDto } from "./dto/crear-pago-lote.dto";
import { CrearTransferenciaLoteDto } from "./dto/crear-transferencia-lote.dto";

@ApiTags('Servicios')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@RequireService('SPR_PRODUBANCO')
@Controller('tramas-produbanco')
export class TramasProdubancoController{
    constructor(private readonly appService: AppService) {}

    @ApiOperation({ summary: 'Generar lote de pagos Produbanco (trama directa)' })
    @Post('pago')
    async generarPago(@Req() req: any, @Body() dto: CrearPagoLoteDto) {
        const idApp = req.appAuth?.id_app;
        if (!idApp) {
            throw new BadRequestException('No se pudo identificar la App desde el token');
        }
        return this.appService.generarPago(idApp, dto);
    }

    @ApiOperation({ summary: 'Generar lote de transferencias al exterior Produbanco (Transfer Full)' })
    @Post('transferencia')
    async generarTransferencia(@Req() req: any, @Body() dto: CrearTransferenciaLoteDto) {
        const idApp = req.appAuth?.id_app;
        if (!idApp) {
            throw new BadRequestException('No se pudo identificar la App desde el token');
        }
        return this.appService.generarTransferencia(idApp, dto);
    }
}
