import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireService } from './require-service.decorator';
import { RequireCmd } from './require-cmd.decorator';
import { AppAuth, AppAuthConId } from './app-auth.decorator';
import { AppService } from './app.service';
import { CrearAppDto } from './dto/crear-app.dto';
import { BloquearAppDto } from './dto/bloquear-app.dto';
import { ActualizarAppDto } from './dto/actualizar-app-payload.dto';
import { AsignarServiciosAppDto } from './dto/asignar-servicios-app.dto';
import { NuevokeyAppDto } from './dto/nuevokey-app.dto';
import { NuevoencryptionkeyAppDto } from './dto/nuevoencryptionkey-app.dto';
import { ActivarDesactivarServicioDto } from './dto/activar-desactivar-servicio.dto';
import { DesasignarServiciosAppDto } from './dto/desasignar-servicios-app.dto';
import { CambiarEstadoServicioAppDto } from './dto/cambiar-estado-servicio-app.dto';

/**
 * Funciones del App administrador.
 *
 * Doble candado: la app debe tener el servicio ADMIN_REGISTER_APP asignado
 * Y el comando (cmp) 'registrar_app' en la jerarquía
 * servicios → servicios_controladores → controladores.
 * `ApiKeyGuard` revalida servicios y permisos contra la BD en cada request,
 * así que los cambios aplican de inmediato sin re-autenticarse.
 *
 * La identidad se obtiene con `@AppAuth()`, que inyecta `request.appAuth`
 * (con `id_app` garantizado) y evita repetir el chequeo en cada handler.
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
    @AppAuth() auth: AppAuthConId,
    @Body() dto: CrearAppDto,
  ): Promise<unknown> {
    return this.appService.crearApp(auth.id_app, dto);
  }

  @ApiOperation({
    summary:
      'Bloquear una app consumidora (activo = false). La app no podrá ' +
      'volver a autenticarse en /auth/login y sus requests en curso se ' +
      'rechazan de inmediato: ApiKeyGuard revalida el estado en cada request. ' +
      'Una app no puede bloquearse a sí misma.',
  })
  @RequireCmd('bloquear_app')
  @HttpCode(HttpStatus.OK)
  @Post('bloquear_app')
  async bloquearApp(
    @AppAuth() auth: AppAuthConId,
    @Body() dto: BloquearAppDto,
  ): Promise<unknown> {
    return this.appService.bloquearApp(auth.id_app, dto);
  }

  @ApiOperation({
    summary:
      'Lista de apps registradas en el microservicio. Devuelve id_app, identificador_app y activo. No devuelve la key ni la encryptionKey.',
  })
  @RequireCmd('listar_apps')
  @HttpCode(HttpStatus.OK)
  @Get('listar_apps')
  async listarApps(@AppAuth() auth: AppAuthConId): Promise<unknown> {
    return this.appService.listarApps(auth.id_app);
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
    @AppAuth() auth: AppAuthConId,
    @Body() dto: ActualizarAppDto,
  ): Promise<unknown> {
    const { idApp } = dto;
    if (!idApp) {
      throw new BadRequestException('idApp es requerido para actualizar_app');
    }
    return this.appService.actualizarApp(auth.id_app, idApp, dto.data);
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
    @AppAuth() auth: AppAuthConId,
    @Body() dto: NuevokeyAppDto,
  ): Promise<unknown> {
    const { idApp } = dto;
    if (!idApp) {
      throw new BadRequestException('idApp es requerido para nuevokey_app');
    }
    // La app admin genera una nueva key para la app especificada (idApp).
    // Se valida que la app objetivo sea diferente a la app administradora.
    return this.appService.nuevokeyApp(idApp, auth.id_app);
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
    @AppAuth() auth: AppAuthConId,
    @Body() dto: NuevoencryptionkeyAppDto,
  ): Promise<unknown> {
    const { idApp } = dto;
    if (!idApp) {
      throw new BadRequestException(
        'idApp es requerido para nuevoencryptionkey_app',
      );
    }
    // Se genera una nueva encryptionKey para la app especificada (idApp).
    return this.appService.nuevoencryptionkeyApp(idApp, auth.id_app);
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
      'Asigna uno o más servicios a una app objetivo usando códigos alfanuméricos. ' +
      'Valida que los códigos existan en la base de datos y actualiza la ' +
      'relación de servicios de la app indicada en `idApp`.',
  })
  @RequireCmd('asignar_servicios_app')
  @HttpCode(HttpStatus.OK)
  @Post('asignar-servicios-app')
  async asignarServiciosApp(
    @AppAuth() auth: AppAuthConId,
    @Body() dto: AsignarServiciosAppDto,
  ): Promise<unknown> {
    // El token identifica a la app administradora (actor). La app objetivo
    // sobre la que se opera viene en el body (`dto.idApp`).
    return this.appService.asignarServiciosApp(
      auth.id_app,
      dto.idApp,
      dto.codigos,
    );
  }

  @ApiOperation({
    summary:
      'Lista de servicios disponibles en el microservicio. Devuelve código, nombre, descripción y activo.',
  })
  @RequireCmd('listar_servicios')
  @HttpCode(HttpStatus.OK)
  @Get('listar-servicios')
  async listarServicios(@AppAuth() auth: AppAuthConId): Promise<unknown> {
    void auth;
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
    @AppAuth() auth: AppAuthConId,
    @Body() dto: ActivarDesactivarServicioDto,
  ): Promise<unknown> {
    return this.appService.activarDesactivarServicioGlobal(
      auth.id_app,
      dto.idServicio,
    );
  }

  @ApiOperation({
    summary:
      'Desasigna uno o más servicios de una app objetivo usando códigos alfanuméricos. ' +
      'Elimina solo las asignaciones especificadas de la app indicada en `idApp`, ' +
      'dejando intactas las demás.',
  })
  @RequireCmd('desasignar_servicios_app')
  @HttpCode(HttpStatus.OK)
  @Post('desasignar-servicios-app')
  async desasignarServiciosApp(
    @AppAuth() auth: AppAuthConId,
    @Body() dto: DesasignarServiciosAppDto,
  ): Promise<unknown> {
    // El token identifica a la app administradora (actor). La app objetivo
    // sobre la que se opera viene en el body (`dto.idApp`).
    return this.appService.desasignarServiciosApp(
      auth.id_app,
      dto.idApp,
      dto.codigos,
    );
  }

  @ApiOperation({
    summary:
      'Activa o desactiva (sin eliminar) la asignación de un servicio para una ' +
      'app objetivo. Escribe el campo activo de app_servicios: true la activa, ' +
      'false la desactiva. No afecta la disponibilidad global del servicio.',
  })
  @RequireCmd('activar_desactivar_servicio_app')
  @HttpCode(HttpStatus.OK)
  @Post('activar-desactivar-servicio-app')
  async activarDesactivarServicioApp(
    @AppAuth() auth: AppAuthConId,
    @Body() dto: CambiarEstadoServicioAppDto,
  ): Promise<unknown> {
    // El token identifica a la app administradora (actor). La app objetivo
    // sobre la que se opera viene en el body (`dto.idApp`).
    return this.appService.cambiarEstadoServicioApp(
      auth.id_app,
      dto.idApp,
      dto.codigo,
      dto.activo,
    );
  }
}
