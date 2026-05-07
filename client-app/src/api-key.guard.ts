import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Inject,
  UnauthorizedException,
  ForbiddenException,
  Logger, // <--- 1. Importamos el Logger
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, catchError, throwError } from 'rxjs';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  // 2. Instanciamos el Logger con el nombre de esta clase para identificarlo en la consola
  private readonly logger = new Logger(ApiKeyGuard.name); 

  constructor(
    @Inject('MATH_SERVICE') private readonly mathClient: ClientProxy,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const appId = request.headers['x-app-id'];
    const appKey = request.headers['x-app-key'];

    if (!appId || !appKey) {
      throw new UnauthorizedException('Faltan credenciales de aplicación');
    }

    try {
      const appInfo = await firstValueFrom(
        this.mathClient.send({ cmd: 'validar_app' }, { identificador: appId, key: appKey }).pipe(
          catchError((error) => throwError(() => new UnauthorizedException(error.message))),
        ),
      );

      request.appAuth = appInfo;

      // 👇 3. AÑADIMOS NUESTRAS "CÁMARAS DE SEGURIDAD" AQUÍ 👇
      this.logger.log(`✅ App Autenticada: ${appInfo.identificador}`);
      this.logger.log(`📦 Servicios habilitados: [${appInfo.servicios.join(', ')}]`);
      this.logger.log(`🔑 Controladores permitidos: [${appInfo.permisos.join(', ')}]`);
      // 👆 ======================================================== 👆

      const servicioExigido = this.reflector.get<string>('servicio_requerido', context.getClass());
      const comandoExigido = this.reflector.get<string>('comando_requerido', context.getHandler());

      if (servicioExigido) {
        if (!appInfo.servicios.includes(servicioExigido)) {
          this.logger.warn(`⛔ Bloqueo: La app no tiene el servicio [${servicioExigido}]`); // Opcional: log de bloqueo
          throw new ForbiddenException(`Acceso denegado: Tu App no tiene asignado el servicio [${servicioExigido}]`);
        }
      }

      if (comandoExigido) {
        if (!appInfo.permisos.includes(comandoExigido)) {
          this.logger.warn(`⛔ Bloqueo: La app no tiene el comando [${comandoExigido}]`); // Opcional: log de bloqueo
          throw new ForbiddenException(`Acceso denegado: No tienes permiso para la acción [${comandoExigido}]`);
        }
      }

      return true;

    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new UnauthorizedException('Error de autenticación con el microservicio', error.message);
    }
  }
}