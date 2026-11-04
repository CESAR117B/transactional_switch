import {
  Controller,
  Get,
  Logger,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

/** Identidad que el ApiKeyGuard global inyecta tras validar el JWT. */
interface AppAuth {
  id_app?: number;
  identificador?: string;
}

/** Request autenticado: `appAuth` lo agrega ApiKeyGuard en cada petición. */
interface AuthenticatedRequest {
  appAuth?: AppAuth;
}

@ApiTags('App')
@ApiBearerAuth()
@Controller('app')
export class AppController {
  private readonly logger = new Logger(AppController.name);

  @ApiOperation({
    summary: 'Verifica que la app cliente esté correctamente autenticada.',
    description:
      'El ApiKeyGuard global ya validó el JWT y revalidó la app (estado, ' +
      'servicios y permisos vigentes) contra el microservicio. Este endpoint ' +
      'expone la identidad confirmada de la app autenticada.',
  })
  @ApiResponse({ status: 200, description: 'App autenticada correctamente.' })
  @ApiResponse({
    status: 401,
    description:
      'Token ausente, inválido o expirado; app bloqueada o eliminada.',
  })
  @ApiResponse({
    status: 503,
    description:
      'Microservicio no disponible (MICROSERVICIO_NO_DISPONIBLE).',
  })
  @Get()
  async getAppData(@Req() request: AuthenticatedRequest) {
    const appAuth = request.appAuth;

    // Defensa en profundidad: no asumir que el guard inyectó los datos.
    if (!appAuth?.id_app) {
      throw new UnauthorizedException(
        'La aplicación no está autenticada correctamente.',
      );
    }

    this.logger.debug(
      `Verificación de autenticación OK: ${
        appAuth.identificador ?? appAuth.id_app
      }`,
    );

    return {
      authenticated: true,
      timestamp: new Date().toISOString(),
    };
  }
}
