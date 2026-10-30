import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
import { BloquearAppDto } from './dto/bloquear-app.dto';
import { ActualizarAppDto } from './dto/actualizar-app-payload.dto';
import { UpdateAppDto } from './dto/update-app.dto';
import { AsignarServiciosAppDto } from './dto/asignar-servicios-app.dto';
import { NuevokeyAppDto } from './dto/nuevokey-app.dto';
import { NuevoencryptionkeyAppDto } from './dto/nuevoencryptionkey-app.dto';
import { ActivarDesactivarServicioDto } from './dto/activar-desactivar-servicio.dto';

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
@RequireService('ADMIN_APPS')
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

  @ApiOperation({
    summary:
      'Bloquear una app consumidora (activo = false). La app no podrá ' +
      'volver a autenticarse en /auth/login. Los JWT ya emitidos siguen ' +
      'vigentes hasta su expiración (1 h). Una app no puede bloquearse a sí ' +
      'misma.',
  })
  @RequireCmd('bloquear_app')
  @HttpCode(HttpStatus.OK)
  @Post('bloquear_app')
  async bloquearApp(
    @Req() req: ReqConAppAuth,
    @Body() dto: BloquearAppDto,
  ): Promise<unknown> {
    const idAppAdmin = req.appAuth?.id_app;
    if (!idAppAdmin) {
      throw new BadRequestException(
        'No se pudo identificar la App desde el token',
      );
    }
    return this.appService.bloquearApp(idAppAdmin, dto);
  }

  @ApiOperation({
    summary:
      'Lista de apps registradas en el microservicio. Devuelve id_app, identificador_app y activo. No devuelve la key ni la encryptionKey.',
  })
  @RequireCmd('listar_apps')
  @HttpCode(HttpStatus.OK)
  @Get('listar_apps')
  async listarApps(
    @Req() req: ReqConAppAuth,
  ): Promise<unknown> {
    const idAppAdmin = req.appAuth?.id_app;
    if (!idAppAdmin) {
      throw new BadRequestException(
        'No se pudo identificar la App desde el token',
      );
    }
    return this.appService.listarApps(idAppAdmin);
  }

  @ApiOperation({
    summary:
      'Actualiza los datos de una app consumidora (identificador, nombre, desarrollador, ruc). ' +
      'No devuelve la key ni la encryptionKey: serán actualizados en otra función.',
  })
  @RequireCmd('actualizar_app')
  @HttpCode(HttpStatus.OK)
  @Post('actualizar_app')
  async actualizarApp(
    @Req() req: ReqConAppAuth,
    @Body() dto: ActualizarAppDto,
  ): Promise<unknown> {
    const idAppAdmin = req.appAuth?.id_app;
    if (!idAppAdmin) {
      throw new BadRequestException(
        'No se pudo identificar la App desde el token',
      );
    }
    const { idApp } = dto;
    if (!idApp) {
      throw new BadRequestException(
        'idApp es requerido para actualizar_app',
      );
    }
    return this.appService.actualizarApp(idApp, dto.data);
  }

  @ApiOperation({
    summary:
      'Genera una nueva key para la app consumidora. La key se entrega en claro ' +
      'UNA sola vez (igual que en el registro inicial). La key hasheada en BD no ' +
      'puede recuperarse. Los servicios de la app deberán actualizar su configuración ' +
      'con la nueva key.',
  })
  @RequireCmd('nuevokey_app')
  @HttpCode(HttpStatus.OK)
  @Post('nuevokey_app')
  async nuevokeyApp(
    @Req() req: ReqConAppAuth,
    @Body() dto: NuevokeyAppDto,
  ): Promise<unknown> {
    const idAppAdmin = req.appAuth?.id_app;
    if (!idAppAdmin) {
      throw new BadRequestException(
        'No se pudo identificar la App desde el token',
      );
    }
    const { idApp } = dto;
    if (!idApp) {
      throw new BadRequestException(
        'idApp es requerido para nuevokey_app',
      );
    }
    // La app admin genera una nueva key para la app especificada (idApp).
    // Se valida que la app objetivo sea diferente a la app administradora.
    return this.appService.nuevokeyApp(idApp, idAppAdmin);
  }

  @ApiOperation({
    summary:
      'Genera una nueva encryptionKey para la app consumidora. La key se entrega en claro ' +
      'UNA sola vez (igual que en el registro inicial). La encryptionKey hasheada en BD no ' +
      'puede recuperarse. Los servicios de la app deberán actualizar su configuración ' +
      'con la nueva encryptionKey.',
  })
  @RequireCmd('nuevoencryptionkey_app')
  @HttpCode(HttpStatus.OK)
  @Post('nuevoencryptionkey_app')
  async nuevoencryptionkeyApp(
    @Req() req: ReqConAppAuth,
    @Body() dto: NuevoencryptionkeyAppDto,
  ): Promise<unknown> {
    const idAppAdmin = req.appAuth?.id_app;
    if (!idAppAdmin) {
      throw new BadRequestException(
        'No se pudo identificar la App desde el token',
      );
    }
    const { idApp } = dto;
    if (!idApp) {
      throw new BadRequestException(
        'idApp es requerido para nuevoencryptionkey_app',
      );
    }
    // Se genera una nueva encryptionKey para la app especificada (idApp).
    return this.appService.nuevoencryptionkeyApp(idApp, idAppAdmin);
  }

  /**
   * Asigna uno o más servicios a una app usando códigos alfanuméricos.
   * Valida que los códigos existan en la base de datos y actualiza la
   * relación de servicios de la app.
   *
   * Doble candado: la app debe tener el servicio ADMIN_APPS asignado Y el
   * comando 'asignar_servicios_app' en la jerarquía servicios → servicios_controladores → controladores.
   */
  @ApiOperation({
    summary:
      'Asigna uno o más servicios a una app usando códigos alfanuméricos. ' +
      'Valida que los códigos existan en la base de datos y actualiza la ' +
      'relación de servicios de la app.',
  })
  @RequireCmd('asignar_servicios_app')
  @HttpCode(HttpStatus.OK)
  @Post('asignar-servicios-app')
  async asignarServiciosApp(
    @Req() req: ReqConAppAuth,
    @Body() dto: AsignarServiciosAppDto,
  ): Promise<unknown> {
    const idApp = req.appAuth?.id_app;
    if (!idApp) {
      throw new BadRequestException(
        'No se pudo identificar la App desde el token',
      );
    }
    return this.appService.asignarServiciosApp(idApp, dto.codigos);
  }

  @ApiOperation({
    summary:
      'Lista de servicios disponibles en el microservicio. Devuelve código, nombre, descripción y activo.',
  })
  @RequireCmd('listar_servicios')
  @HttpCode(HttpStatus.OK)
  @Get('listar-servicios')
  async listarServicios(
    @Req() req: ReqConAppAuth,
  ): Promise<unknown> {
    const idApp = req.appAuth?.id_app;
    if (!idApp) {
      throw new BadRequestException(
        'No se pudo identificar la App desde el token',
      );
    }
    return this.appService.listarServicios();
  }

  @ApiOperation({
    summary:
      'Activa o desactiva un servicio de forma global (afecta a todas las apps).' +
      ' El servicio debe estar asignado a la app admin para que el comando sea válido.',
  })
  @RequireCmd('activar_desactivar_servicio')
  @HttpCode(HttpStatus.OK)
  @Post('activar-desactivar-servicio')
  async activarDesactivarServicio(
    @Req() req: ReqConAppAuth,
    @Body() dto: ActivarDesactivarServicioDto,
  ): Promise<unknown> {
    const idApp = req.appAuth?.id_app;
    if (!idApp) {
      throw new BadRequestException(
        'No se pudo identificar la App desde el token',
      );
    }
    return this.appService.activarDesactivarServicioGlobal(dto.idServicio);
  }
}

/** Request con el appAuth inyectado por el ApiKeyGuard global (JWT). */
interface ReqConAppAuth {
  appAuth?: { id_app?: number };
}