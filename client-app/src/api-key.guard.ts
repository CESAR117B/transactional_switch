import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Rutas públicas (@Public()) no exigen JWT.
    const esPublico = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (esPublico) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // Header estándar 'Authorization: Bearer <token>'
    const authHeader = request.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException(
        'Falta el token de autenticación (Authorization Header)',
      );
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException(
        'Formato de token inválido. Debe ser Bearer <token>',
      );
    }

    try {
      // Secret único: el registrado en JwtModule (sin fallback provisorio).
      // Algoritmo fijado explícitamente por seguridad.
      const payload = await this.jwtService.verifyAsync(token, {
        algorithms: ['HS256'],
      });

      const appInfo = {
        id_app: payload.id_app,
        identificador: payload.sub,
        servicios: payload.servicios || [],
        permisos: payload.permisos || [],
      };

      request.appAuth = appInfo;

      this.logger.debug(`App autenticada vía JWT: ${appInfo.identificador}`);
      this.logger.debug(
        `Servicios: [${appInfo.servicios?.join(', ') || 'Ninguno'}] ` +
          `Permisos: [${appInfo.permisos?.join(', ') || 'Ninguno'}]`,
      );

      const servicioExigido = this.reflector.get<string>(
        'servicio_requerido',
        context.getClass(),
      );
      const comandoExigido = this.reflector.get<string>(
        'comando_requerido',
        context.getHandler(),
      );

      if (servicioExigido) {
        if (
          !appInfo.servicios ||
          !appInfo.servicios.includes(servicioExigido)
        ) {
          this.logger.warn(
            `Bloqueo: La app no tiene el servicio [${servicioExigido}]`,
          );
          throw new ForbiddenException(
            `Acceso denegado: Tu App no tiene asignado el servicio [${servicioExigido}]`,
          );
        }
      }

      if (comandoExigido) {
        if (!appInfo.permisos || !appInfo.permisos.includes(comandoExigido)) {
          this.logger.warn(
            `Bloqueo: La app no tiene el comando [${comandoExigido}]`,
          );
          throw new ForbiddenException(
            `Acceso denegado: No tienes permiso para la acción [${comandoExigido}]`,
          );
        }
      }

      return true;
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) throw error;
      if (error instanceof UnauthorizedException) throw error;

      const nombre = error instanceof Error ? error.name : '';
      if (nombre === 'TokenExpiredError') {
        throw new UnauthorizedException(
          'El token ha expirado. Por favor, solicita uno nuevo en /auth/login.',
        );
      }
      if (nombre === 'JsonWebTokenError') {
        throw new UnauthorizedException('Token inválido o corrupto.');
      }

      // Mensaje genérico al cliente: NO filtrar error.message (internos).
      this.logger.error(
        'Error interno en ApiKeyGuard',
        error instanceof Error ? error.stack : String(error),
      );
      throw new UnauthorizedException('Error de autenticación');
    }
  }
}
