import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { BloquearAppPayloadDto } from '../dto/bloquear-app.dto';
import { CrearAppPayloadDto } from '../dto/crear-app.dto';
import { ActualizarAppPayloadDto } from '../dto/actualizar-app-payload.dto';
import { NuevokeyAppPayloadDto } from '../dto/nuevokey-app.dto';
import { NuevoencryptionkeyAppPayloadDto } from '../dto/nuevoencryptionkey-app.dto';
import { AppsService } from './apps.service';
import { ActivarDesactivarServicioDto } from './dto/activar-desactivar-servicio.dto';
import { AsignarServiciosAppDto } from '../dto/asignar-servicios-app.dto';
import { DesasignarServiciosAppDto } from './dto/desasignar-servicios-app.dto';

/**
 * Handlers RPC de administración de apps.
 *
 * La traducción de excepciones a `{ statusCode, message, error }` la hace el
 * filtro global `RpcExceptionFilter`; acá sólo se valida la entrada.
 */
@Controller('admin')
export class AppsController {
  private readonly logger = new Logger(AppsController.name);

  constructor(private readonly appsService: AppsService) {}

  /**
   * Alta de una app consumidora (sólo la App administradora con el
   * permiso 'registrar_app' puede llegar acá, vía el guard del gateway).
   */
  @MessagePattern({ cmd: 'crear_app' })
  async crearApp(@Payload() payload: CrearAppPayloadDto) {
    const { id_app, data } = payload ?? ({} as CrearAppPayloadDto);

    if (id_app === undefined || id_app === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'id_app es requerido',
      });
    }
    if (!data) {
      throw new RpcException({
        statusCode: 400,
        message: 'data es requerida para crear_app',
      });
    }

    this.logger.log(
      `crear_app id_app_admin=${id_app} user_app=${data.user_app}`,
    );
    return this.appsService.crearApp(id_app, data);
  }

  @MessagePattern({ cmd: 'bloquear_app' })
  async bloquearApp(@Payload() payload: BloquearAppPayloadDto) {
    const { id_app, id_app_admin } = payload ?? ({} as BloquearAppPayloadDto);

    if (id_app === undefined || id_app === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'id_app es requerido para bloquear_app',
        error: 'Bad Request',
      });
    }
    if (id_app_admin === undefined || id_app_admin === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'id_app_admin es requerido para bloquear_app',
        error: 'Bad Request',
      });
    }

    this.logger.log(`bloquear_app id_app=${id_app} id_app_admin=${id_app_admin}`);
    return this.appsService.bloquearApp(id_app, id_app_admin);
  }

  @MessagePattern({ cmd: 'listar_apps' })
  async listarApps(@Payload() payload: { id_app?: number }) {
    const id_app = payload?.id_app;
    if (id_app === undefined || id_app === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'id_app es requerido para listar_apps',
        error: 'Bad Request',
      });
    }

    this.logger.log(`listar_apps id_app_admin=${id_app}`);
    return this.appsService.listarApps(id_app);
  }

  @MessagePattern({ cmd: 'actualizar_app' })
  async actualizarApp(@Payload() payload: ActualizarAppPayloadDto) {
    const { id_app, data, id_app_admin } = payload;

    if (id_app === undefined || id_app === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'id_app es requerido para actualizar_app',
        error: 'Bad Request',
      });
    }
    if (!data) {
      throw new RpcException({
        statusCode: 400,
        message: 'data es requerida para actualizar_app',
        error: 'Bad Request',
      });
    }
    if (id_app_admin === undefined || id_app_admin === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'id_app_admin es requerido para actualizar_app',
        error: 'Bad Request',
      });
    }

    this.logger.log(`actualizar_app id_app=${id_app} id_app_admin=${id_app_admin}`);
    return this.appsService.actualizarApp(id_app, data, id_app_admin);
  }

  @MessagePattern({ cmd: 'nuevokey_app' })
  async nuevokeyApp(@Payload() payload: NuevokeyAppPayloadDto) {
    const { id_app, id_app_admin } = payload;

    if (id_app === undefined || id_app === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'id_app es requerido para nuevokey_app',
        error: 'Bad Request',
      });
    }
    if (id_app_admin === undefined || id_app_admin === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'id_app_admin es requerido para nuevokey_app',
        error: 'Bad Request',
      });
    }

    this.logger.log(`nuevokey_app id_app=${id_app} id_app_admin=${id_app_admin}`);
    return this.appsService.nuevokeyApp(id_app, id_app_admin);
  }

  @MessagePattern({ cmd: 'asignar_servicios_app' })
  async asignarServiciosApp(@Payload() payload: AsignarServiciosAppDto) {
    const { id_app, codigos, id_app_admin } = payload ?? {};

    if (id_app === undefined || id_app === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'id_app es requerido para asignar_servicios_app',
        error: 'Bad Request',
      });
    }
    if (
      codigos === undefined ||
      codigos === null ||
      !Array.isArray(codigos) ||
      codigos.length === 0
    ) {
      throw new RpcException({
        statusCode: 400,
        message: 'codigos es requerido y debe ser un array no vacío',
        error: 'Bad Request',
      });
    }
    if (id_app_admin === undefined || id_app_admin === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'id_app_admin es requerido para asignar_servicios_app',
        error: 'Bad Request',
      });
    }

    this.logger.log(
      `asignar_servicios_app id_app=${id_app} id_app_admin=${id_app_admin} codigos=${JSON.stringify(codigos)}`,
    );
    return this.appsService.asignarServiciosApp(id_app, codigos, id_app_admin);
  }

  @MessagePattern({ cmd: 'nuevoencryptionkey_app' })
  async nuevoencryptionKeyApp(
    @Payload() payload: NuevoencryptionkeyAppPayloadDto,
  ) {
    const { id_app, id_app_admin } = payload;

    if (id_app === undefined || id_app === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'id_app es requerido para nuevoencryptionkey_app',
        error: 'Bad Request',
      });
    }
    if (id_app_admin === undefined || id_app_admin === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'id_app_admin es requerido para nuevoencryptionkey_app',
        error: 'Bad Request',
      });
    }

    this.logger.log(
      `nuevoencryptionkey_app id_app=${id_app} id_app_admin=${id_app_admin}`,
    );
    return this.appsService.nuevoencryptionKeyApp(id_app, id_app_admin);
  }

  @MessagePattern({ cmd: 'listar_servicios' })
  async listarServicios() {
    return this.appsService.listarServicios();
  }

  @MessagePattern({ cmd: 'desasignar_servicios_app' })
  async desasignarServiciosApp(@Payload() payload: DesasignarServiciosAppDto) {
    const { id_app, codigos, id_app_admin } = payload;

    if (id_app === undefined || id_app === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'id_app es requerido para desasignar_servicios_app',
        error: 'Bad Request',
      });
    }
    if (
      codigos === undefined ||
      codigos === null ||
      !Array.isArray(codigos) ||
      codigos.length === 0
    ) {
      throw new RpcException({
        statusCode: 400,
        message: 'codigos es requerido y debe ser un array no vacío',
        error: 'Bad Request',
      });
    }
    if (id_app_admin === undefined || id_app_admin === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'id_app_admin es requerido para desasignar_servicios_app',
        error: 'Bad Request',
      });
    }

    this.logger.log(
      `desasignar_servicios_app id_app=${id_app} id_app_admin=${id_app_admin} codigos=${JSON.stringify(codigos)}`,
    );
    return this.appsService.desasignarServiciosApp(
      id_app,
      codigos,
      id_app_admin,
    );
  }

  @MessagePattern({ cmd: 'activar_desactivar_servicio_app' })
  async activarDesactivarServicioApp(
    @Payload()
    payload: {
      id_app: number;
      codigo: string;
      activo: boolean;
      id_app_admin: number;
    },
  ) {
    const { id_app, codigo, activo, id_app_admin } = payload ?? ({} as {
      id_app: number;
      codigo: string;
      activo: boolean;
      id_app_admin: number;
    });

    if (id_app === undefined || id_app === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'id_app es requerido para activar_desactivar_servicio_app',
        error: 'Bad Request',
      });
    }
    if (codigo === undefined || codigo === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'codigo es requerido para activar_desactivar_servicio_app',
        error: 'Bad Request',
      });
    }
    if (typeof activo !== 'boolean') {
      throw new RpcException({
        statusCode: 400,
        message:
          'activo es requerido y debe ser boolean para activar_desactivar_servicio_app',
        error: 'Bad Request',
      });
    }
    if (id_app_admin === undefined || id_app_admin === null) {
      throw new RpcException({
        statusCode: 400,
        message:
          'id_app_admin es requerido para activar_desactivar_servicio_app',
        error: 'Bad Request',
      });
    }

    this.logger.log(
      `activar_desactivar_servicio_app id_app=${id_app} id_app_admin=${id_app_admin} codigo=${codigo} activo=${activo}`,
    );
    return this.appsService.cambiarEstadoServicioApp(
      id_app,
      codigo,
      activo,
      id_app_admin,
    );
  }

  @MessagePattern({ cmd: 'activar_desactivar_servicio' })
  async activar_desactivarServicio(
    @Payload() payload: ActivarDesactivarServicioDto,
  ) {
    const { id_servicio, id_app_admin } = payload;

    if (id_servicio === undefined || id_servicio === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'id_servicio es requerido para activar_desactivar_servicio',
        error: 'Bad Request',
      });
    }
    if (id_app_admin === undefined || id_app_admin === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'id_app_admin es requerido para activar_desactivar_servicio',
        error: 'Bad Request',
      });
    }

    this.logger.log(
      `activar_desactivar_servicio id_servicio=${id_servicio} id_app_admin=${id_app_admin}`,
    );
    return this.appsService.activarDesactivarServicio(
      id_servicio,
      id_app_admin,
    );
  }
}
