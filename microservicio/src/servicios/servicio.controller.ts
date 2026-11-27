import { Controller } from '@nestjs/common';
import { ServiciosService } from './servicios.service';
import { MessagePattern, Payload } from '@nestjs/microservices';

@Controller()
export class ServicioController {
  constructor(private servicios: ServiciosService) {}

  @MessagePattern({ cmd: 'get_servicios' })
  getServicios(@Payload() payload: { id_app: number }) {
    return this.servicios.getServicios(payload.id_app);
  }
}
