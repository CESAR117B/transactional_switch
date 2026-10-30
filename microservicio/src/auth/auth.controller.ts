// En tu Microservicio
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @MessagePattern({ cmd: 'validar_app' })
  validarApp(@Payload() data: { identificador: string; key: string }) {
    return this.authService.validarCredencialesApp(
      data.identificador,
      data.key,
    );
  }

  /**
   * Revalida los servicios/permisos de una app ya autenticada contra la BD.
   * El gateway lo invoca en cada request para que la desactivación global o
   * por app aplique de inmediato, sin esperar la expiración del JWT.
   */
  @MessagePattern({ cmd: 'validar_permisos_app' })
  validarPermisosApp(@Payload() data: { idApp?: number }) {
    const idApp = Number(data?.idApp);
    if (!Number.isInteger(idApp) || idApp <= 0) {
      throw new RpcException({
        status: 400,
        message: 'idApp es requerido para validar_permisos_app',
      });
    }
    return this.authService.obtenerPermisosVigentes(idApp);
  }
}
