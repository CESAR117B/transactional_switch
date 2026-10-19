import {
  Body,
  Controller,
  Inject,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { ClientProxy } from '@nestjs/microservices';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { LoginDto } from './dto/auth.dto';
import { Public } from './public.decorator';
import { rateLimitLoginMax } from './throttler.config';

@ApiTags('App')
@Public() // Único endpoint sin JWT (el guard global lo respeta)
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly jwtService: JwtService,
    @Inject('MATH_SERVICE') private readonly mathClient: ClientProxy,
  ) {}

  @Post('login')
  // Fuerza bruta: máximo RATE_LIMIT_LOGIN_MAX intentos/minuto por IP (5 por defecto)
  @Throttle({ default: { limit: () => rateLimitLoginMax(), ttl: 60000 } })
  @ApiOperation({
    summary: 'Iniciar sesión de la aplicación',
    description:
      'Valida las credenciales maestras de la app y retorna un token JWT válido por 1 hora.',
  })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas.' })
  @ApiResponse({ status: 429, description: 'Demasiados intentos de login.' })
  async login(@Body() credentials: LoginDto) {
    try {
      // 1. Validamos las credenciales contra el microservicio
      const appInfo = await firstValueFrom(
        this.mathClient.send(
          { cmd: 'validar_app' },
          { identificador: credentials.app_id, key: credentials.app_key },
        ),
      );

      if (!appInfo) {
        throw new UnauthorizedException('Credenciales inválidas');
      }

      // 2. Firma con el secret y expiración de JwtModule (única fuente)
      const payload = {
        id_app: appInfo.id_app,
        sub: appInfo.identificador,
        servicios: appInfo.servicios,
        permisos: appInfo.permisos,
      };
      const access_token = this.jwtService.sign(payload);

      this.logger.log(`Login OK: ${appInfo.identificador}`);
      return {
        access_token,
        expires_in: 3600,
      };
    } catch (error: unknown) {
      // Un solo mensaje al cliente (sin revelar si el app_id existe o no);
      // el detalle se guarda en el log del servidor.
      this.logger.warn(
        `Login fallido: ${credentials.app_id} — ${
          error instanceof Error ? error.message : JSON.stringify(error)
        }`,
      );
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Credenciales inválidas');
    }
  }
}
