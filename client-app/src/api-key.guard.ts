import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt'; // Importamos el servicio de JWT

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name); 

  constructor(
    private readonly jwtService: JwtService, // Inyectamos el JwtService (Reemplaza al mathClient)
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // 3. Extraemos el header estándar 'Authorization: Bearer <token>'
    const authHeader = request.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException('Falta el token de autenticación (Authorization Header)');
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Formato de token inválido. Debe ser Bearer <token>');
    }

    try {
      // 4. Verificamos el token matemáticamente usando tu firma secreta
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET,
      });

      // 5. Mapeamos el payload del JWT a la estructura 'appInfo' que ya usabas
      const appInfo = {
        id_app: payload.id_app,
        identificador: payload.sub,
        servicios: payload.servicios || [],
        permisos: payload.permisos || [],
      };

      request.appAuth = appInfo;

      //  TUS CÁMARAS DE SEGURIDAD (Se mantienen intactas) 
      this.logger.log(`✅ App Autenticada vía JWT: ${appInfo.identificador}`);
      this.logger.log(`📦 Servicios habilitados: [${appInfo.servicios?.join(', ') || 'Ninguno'}]`);
      this.logger.log(`🔑 Controladores permitidos: [${appInfo.permisos?.join(', ') || 'Ninguno'}]`);

      const servicioExigido = this.reflector.get<string>('servicio_requerido', context.getClass());
      const comandoExigido = this.reflector.get<string>('comando_requerido', context.getHandler());

      //  TUS VALIDACIONES (Se mantienen exactamente igual) 
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
      // Manejo inteligente de errores específicos de JWT
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('El token ha expirado. Por favor, solicita uno nuevo en /auth/login.');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Token inválido o corrupto.');
      }
      
      if (error instanceof ForbiddenException) throw error;
      if (error instanceof UnauthorizedException) throw error;

      this.logger.error(`Error interno en ApiKeyGuard: ${error.message}`, error.stack);
      throw new UnauthorizedException('Error de autenticación: ' + error.message);
    }
  }
}