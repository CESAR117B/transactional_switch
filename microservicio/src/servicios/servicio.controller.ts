import { Controller } from "@nestjs/common";
import { Servicios } from "./servicios";
import { MessagePattern, Payload } from "@nestjs/microservices";


@Controller()
export class ServicioController {

    constructor(
        private servicios: Servicios
    ){}

    @MessagePattern({cmd: 'get_servicios'})
    getServicios(@Payload() appID: number){
        return this.servicios.getServicios(appID);
    }

    
    @MessagePattern({cmd: 'cuanto_paga'})
    cuantoPaga(@Payload() data: {appId: number, codigo_servicio: string}){
        return this.servicios.cuanto_paga(data.appId, data.codigo_servicio);
    }

    
}