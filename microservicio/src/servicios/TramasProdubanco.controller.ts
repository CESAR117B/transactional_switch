import { Controller, Logger } from "@nestjs/common";
import { TramasProdubancoService } from "./TramasProdubanco.service";
import { MessagePattern, Payload, RpcException } from "@nestjs/microservices";
import { CrearPagoLoteDto, GenerarPagoPayloadDto } from "./dto/crear-pago-lote.dto";
import { CrearTransferenciaLoteDto, GenerarTransferenciaPayloadDto } from "./dto/crear-transferencia-lote.dto";

@Controller()
export class TramasProdubancoController {
    private readonly logger = new Logger(TramasProdubancoController.name);

    constructor(
        private readonly tramasProdubancoService: TramasProdubancoService
    ){}

    @MessagePattern({cmd: 'pago'})
    @MessagePattern({cmd: 'generar_pago'})
    async generarPago(@Payload() payload: GenerarPagoPayloadDto) {
        const { idApp, data } = payload;
        if (idApp === undefined || idApp === null) {
            throw new RpcException({ statusCode: 400, message: 'idApp es requerido' });
        }
        if (!data) {
            throw new RpcException({ statusCode: 400, message: 'data es requerida para generarPago' });
        }
        this.logger.log(`generarPago idApp=${idApp} referenciaLote=${data.referenciaLote} registros=${data.detalles?.length ?? 0}`);
        try {
            return await this.tramasProdubancoService.generarPago(idApp, data);
        } catch (error: any) {
            if (error instanceof RpcException) throw error;
            // Preserva BadRequest/Rpc del service y transforma resto a RpcException para TCP
            const status = error?.status ?? error?.statusCode ?? 500;
            const message = error?.message ?? 'Error interno en generarPago';
            this.logger.error(`Error generarPago idApp=${idApp} ref=${data.referenciaLote}: ${message}`, error?.stack);
            throw new RpcException({ statusCode: status, message, error: error?.error });
        }
    }

    @MessagePattern({cmd: 'transferencia'})
    @MessagePattern({cmd: 'generar_transferencia'})
    async generarTransferencia(@Payload() payload: GenerarTransferenciaPayloadDto) {
        const { idApp, data } = payload;
        if (idApp === undefined || idApp === null) {
            throw new RpcException({ statusCode: 400, message: 'idApp es requerido' });
        }
        if (!data) {
            throw new RpcException({ statusCode: 400, message: 'data es requerida para generarTransferencia' });
        }
        this.logger.log(`generarTransferencia idApp=${idApp} referenciaLote=${data.referenciaLote} registros=${data.detalles?.length ?? 0}`);
        try {
            return await this.tramasProdubancoService.generarTransferencia(idApp, data);
        } catch (error: any) {
            if (error instanceof RpcException) throw error;
            const status = error?.status ?? error?.statusCode ?? 500;
            const message = error?.message ?? 'Error interno en generarTransferencia';
            this.logger.error(`Error generarTransferencia idApp=${idApp} ref=${data.referenciaLote}: ${message}`, error?.stack);
            throw new RpcException({ statusCode: status, message, error: error?.error });
        }
    }
}
