import { Controller } from '@nestjs/common';
import { ServiciosService } from './servicios.service';
import { MessagePattern, Payload } from '@nestjs/microservices';

@Controller()
export class ServicioController {
  constructor(private servicios: ServiciosService) {}

  @MessagePattern({ cmd: 'get_servicios' })
  getServicios(@Payload() appID: number) {
    return this.servicios.getServicios(appID);
  }
}
