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
    const { idApp, data } = payload ?? ({} as CrearAppPayloadDto);

    if (idApp === undefined || idApp === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'idApp es requerido',
      });
    }
    if (!data) {
      throw new RpcException({
        statusCode: 400,
        message: 'data es requerida para crear_app',
      });
    }

    this.logger.log(
      `crear_app idAppAdmin=${idApp} identificador=${data.identificador_app}`,
    );
    return this.appsService.crearApp(idApp, data);
  }

  @MessagePattern({ cmd: 'bloquear_app' })
  async bloquearApp(@Payload() payload: BloquearAppPayloadDto) {
    const { idApp, idAppAdmin } = payload ?? ({} as BloquearAppPayloadDto);

    if (idApp === undefined || idApp === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'idApp es requerido para bloquear_app',
        error: 'Bad Request',
      });
    }
    if (idAppAdmin === undefined || idAppAdmin === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'idAppAdmin es requerido para bloquear_app',
        error: 'Bad Request',
      });
    }

    this.logger.log(`bloquear_app idApp=${idApp} idAppAdmin=${idAppAdmin}`);
    return this.appsService.bloquearApp(idApp, idAppAdmin);
  }

  @MessagePattern({ cmd: 'listar_apps' })
  async listarApps(@Payload() payload: { idApp?: number }) {
    const idApp = payload?.idApp;
    if (idApp === undefined || idApp === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'idApp es requerido para listar_apps',
        error: 'Bad Request',
      });
    }

    this.logger.log(`listar_apps idAppAdmin=${idApp}`);
    return this.appsService.listarApps(idApp);
  }

  @MessagePattern({ cmd: 'actualizar_app' })
  async actualizarApp(@Payload() payload: ActualizarAppPayloadDto) {
    const { idApp, data, idAppAdmin } = payload;

    if (idApp === undefined || idApp === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'idApp es requerido para actualizar_app',
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

    this.logger.log(`actualizar_app idApp=${idApp}`);
    return this.appsService.actualizarApp(idApp, data, idAppAdmin);
  }

  @MessagePattern({ cmd: 'nuevokey_app' })
  async nuevokeyApp(@Payload() payload: NuevokeyAppPayloadDto) {
    const { idApp, idAppAdmin } = payload;

    if (idApp === undefined || idApp === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'idApp es requerido para nuevokey_app',
        error: 'Bad Request',
      });
    }
    if (idAppAdmin === undefined || idAppAdmin === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'idAppAdmin es requerido para nuevokey_app',
        error: 'Bad Request',
      });
    }

    this.logger.log(`nuevokey_app idApp=${idApp} idAppAdmin=${idAppAdmin}`);
    return this.appsService.nuevokeyApp(idApp, idAppAdmin);
  }

  @MessagePattern({ cmd: 'asignar_servicios_app' })
  async asignarServiciosApp(@Payload() payload: AsignarServiciosAppDto) {
    const { idApp, codigos, idAppAdmin } = payload ?? {};

    if (idApp === undefined || idApp === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'idApp es requerido para asignar_servicios_app',
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

    this.logger.log(
      `asignar_servicios_app idApp=${idApp} codigos=${JSON.stringify(codigos)}`,
    );
    return this.appsService.asignarServiciosApp(idApp, codigos, idAppAdmin);
  }

  @MessagePattern({ cmd: 'nuevoencryptionkey_app' })
  async nuevoencryptionKeyApp(
    @Payload() payload: NuevoencryptionkeyAppPayloadDto,
  ) {
    const { idApp, idAppAdmin } = payload;

    if (idApp === undefined || idApp === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'idApp es requerido para nuevoencryptionkey_app',
        error: 'Bad Request',
      });
    }
    if (idAppAdmin === undefined || idAppAdmin === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'idAppAdmin es requerido para nuevoencryptionkey_app',
        error: 'Bad Request',
      });
    }

    this.logger.log(
      `nuevoencryptionkey_app idApp=${idApp} idAppAdmin=${idAppAdmin}`,
    );
    return this.appsService.nuevoencryptionKeyApp(idApp, idAppAdmin);
  }

  @MessagePattern({ cmd: 'listar_servicios' })
  async listarServicios() {
    return this.appsService.listarServicios();
  }

  @MessagePattern({ cmd: 'desasignar_servicios_app' })
  async desasignarServiciosApp(@Payload() payload: DesasignarServiciosAppDto) {
    const { idApp, codigos, idAppAdmin } = payload;

    if (idApp === undefined || idApp === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'idApp es requerido para desasignar_servicios_app',
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

    this.logger.log(
      `desasignar_servicios_app idApp=${idApp} codigos=${JSON.stringify(codigos)}`,
    );
    return this.appsService.desasignarServiciosApp(
      idApp,
      codigos,
      idAppAdmin,
    );
  }

  @MessagePattern({ cmd: 'activar_desactivar_servicio_app' })
  async activarDesactivarServicioApp(
    @Payload()
    payload: {
      idApp: number;
      codigo: string;
      activo: boolean;
      idAppAdmin?: number;
    },
  ) {
    const { idApp, codigo, activo, idAppAdmin } = payload ?? ({} as {
      idApp: number;
      codigo: string;
      activo: boolean;
      idAppAdmin?: number;
    });

    if (idApp === undefined || idApp === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'idApp es requerido para activar_desactivar_servicio_app',
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

    this.logger.log(
      `activar_desactivar_servicio_app idApp=${idApp} codigo=${codigo} activo=${activo}`,
    );
    return this.appsService.cambiarEstadoServicioApp(
      idApp,
      codigo,
      activo,
      idAppAdmin,
    );
  }

  @MessagePattern({ cmd: 'activar_desactivar_servicio' })
  async activar_desactivarServicio(
    @Payload() payload: ActivarDesactivarServicioDto,
  ) {
    const { idServicio, idAppAdmin } = payload;

    if (idServicio === undefined || idServicio === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'idServicio es requerido para activar_desactivar_servicio',
        error: 'Bad Request',
      });
    }

    this.logger.log(`activar_desactivar_servicio idServicio=${idServicio}`);
    return this.appsService.activarDesactivarServicio(
      idServicio,
      idAppAdmin,
    );
  }
}
