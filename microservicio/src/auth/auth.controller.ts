// En tu Microservicio
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @MessagePattern({ cmd: 'validar_app' })
  validarApp(@Payload() data: { user_app: string; key: string }) {
    return this.authService.validarCredencialesApp(data.user_app, data.key);
  }

  /**
   * Revalida los servicios/permisos de una app ya autenticada contra la BD.
   * El gateway lo invoca en cada request para que la desactivación global o
   * por app aplique de inmediato, sin esperar la expiración del JWT.
   */
  @MessagePattern({ cmd: 'validar_permisos_app' })
  validarPermisosApp(@Payload() data: { id_app?: number }) {
    const id_app = Number(data?.id_app);
    if (!Number.isInteger(id_app) || id_app <= 0) {
      throw new RpcException({
        status: 400,
        message: 'id_app es requerido para validar_permisos_app',
      });
    }
    return this.authService.obtenerPermisosVigentes(id_app);
  }
}
