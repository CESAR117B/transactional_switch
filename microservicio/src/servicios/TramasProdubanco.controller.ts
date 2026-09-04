import { Controller } from "@nestjs/common";
import { TramasProdubancoService } from "./TramasProdubanco.service";
import { MessagePattern, Payload } from "@nestjs/microservices";


@Controller('tramas-produbanco')
export class TramasProdubancoController {

    constructor(
        private readonly tramasProdubancoService: TramasProdubancoService
    ){}

    @MessagePattern({cmd: 'pago'})
    @MessagePattern({cmd: 'generar_pago'})
    generarPago(@Payload() payload: { idApp: number, data: any }) {
        const { idApp, data } = payload;
        return this.tramasProdubancoService.generarPago(idApp, data);
    }

    @MessagePattern('transferencia')
    @MessagePattern({cmd: 'generar_transferencia'})
    generarTransferencia(@Payload() payload: { idApp: number, data: any }) {
        const { idApp, data } = payload;
        return this.tramasProdubancoService.generarTransferencia(idApp, data);
    }

}