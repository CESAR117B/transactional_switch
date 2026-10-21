import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireService } from './require-service.decorator';
import { RequireCmd } from './require-cmd.decorator';
import { AppService } from './app.service';
import { CrearAppDto } from './dto/crear-app.dto';

/**
 * Funciones del App administrador.
 *
 * Doble candado: la app debe tener el servicio ADMIN_REGISTER_APP asignado
 * Y el comando (cmp) 'registrar_app' en la jerarquía
 * servicios → servicios_controladores → controladores.
 * El JWT se firma con esos permisos al hacer login, así que la app admin
 * debe re-autenticarse después de asignarlos en BD.
 */
@ApiTags('Admin')
@ApiBearerAuth()
@RequireService('ADMIN_REGISTER_APP')
@Controller('admin')
export class AdminAppsController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({
    summary:
      'Registrar una nueva app en el microservicio. Devuelve UNA sola vez ' +
      'las credenciales en claro (key + encryptionKey): la key se guarda ' +
      'hasheadada y no se puede recuperar. La app nace sin servicios ' +
      'asignados.',
  })
  @RequireCmd('registrar_app')
  @HttpCode(HttpStatus.CREATED)
  @Post('registrar_app')
  async crearApp(
    @Req() req: ReqConAppAuth,
    @Body() dto: CrearAppDto,
  ): Promise<unknown> {
    const idApp = req.appAuth?.id_app;
    if (!idApp) {
      throw new BadRequestException(
        'No se pudo identificar la App desde el token',
      );
    }
    return this.appService.crearApp(idApp, dto);
  }
}

/** Request con el appAuth inyectado por el ApiKeyGuard global (JWT). */
interface ReqConAppAuth {
  appAuth?: { id_app?: number };
}
