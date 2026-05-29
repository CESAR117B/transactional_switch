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
    // Nota: Express/Fastify convierten los headers a minúsculas automáticamente
    const appId = request.headers['app_id'];
    const appKey = request.headers['app_key'];

    if (!appId || !appKey) {
      throw new UnauthorizedException('Faltan credenciales de aplicación (app_id o app_key)');
    }

    try {
      const appInfo = await firstValueFrom(
        this.mathClient.send({ cmd: 'validar_app' }, { identificador: appId, key: appKey }).pipe(
          catchError((error) => throwError(() => new UnauthorizedException(error.message))),
        ),
      );

      request.appAuth = appInfo;

      // 👇 1. LOGS SEGUROS: Usamos ?. para evitar que .join() rompa la app si vienen nulos
      this.logger.log(`✅ App Autenticada: ${appInfo.identificador}`);
      this.logger.log(`📦 Servicios habilitados: [${appInfo.servicios?.join(', ') || 'Ninguno'}]`);
      this.logger.log(`🔑 Controladores permitidos: [${appInfo.permisos?.join(', ') || 'Ninguno'}]`);

      const servicioExigido = this.reflector.get<string>('servicio_requerido', context.getClass());
      const comandoExigido = this.reflector.get<string>('comando_requerido', context.getHandler());

      // 👇 2. VALIDACIONES SEGURAS: Verificamos que existan antes de usar .includes()
      if (servicioExigido) {
        if (!appInfo.servicios || !appInfo.servicios.includes(servicioExigido)) {
          this.logger.warn(`⛔ Bloqueo: La app no tiene el servicio [${servicioExigido}]`);
          throw new ForbiddenException(`Acceso denegado: Tu App no tiene asignado el servicio [${servicioExigido}]`);
        }
      }

      if (comandoExigido) {
        if (!appInfo.permisos || !appInfo.permisos.includes(comandoExigido)) {
          this.logger.warn(`⛔ Bloqueo: La app no tiene el comando [${comandoExigido}]`);
          throw new ForbiddenException(`Acceso denegado: No tienes permiso para la acción [${comandoExigido}]`);
        }
      }

      return true;

    } catch (error) {
      // 👇 3. Imprimimos el error real en la consola de NestJS para que no sea un misterio la próxima vez
      if (!(error instanceof ForbiddenException) && !(error instanceof UnauthorizedException)) {
        this.logger.error(`Error interno en ApiKeyGuard: ${error.message}`, error.stack);
      }
      
      if (error instanceof ForbiddenException) throw error;
      throw new UnauthorizedException('Error de autenticación con el microservicio: ' + error.message);
    }
  }
}