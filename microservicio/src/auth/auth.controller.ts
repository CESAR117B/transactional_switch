// En tu Microservicio
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @MessagePattern({ cmd: 'validar_app' })
  validarApp(@Payload() data: { identificador: string; key: string }) {
    return this.authService.validarCredencialesApp(data.identificador, data.key);
  }
}