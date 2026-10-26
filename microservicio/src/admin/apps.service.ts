import { Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ApplicationService } from '../servicios/application.service';
import { CrearAppDto } from '../dto/crear-app.dto';
import { UpdateAppDto } from '../dto/update-app.dto';
import { TransactionLogEvent } from '../events/transaction-log.event';

/** Largo de la key de login generada (24 bytes → 32 chars base64url). */
const KEY_LONGITUD_BYTES = 24;

/**
 * Valor del campo `servicio` en las auditorías de la sección admin.
 * Debe empezar con ADMIN (convención para distinguir los registros
 * administrativos del resto de servicios del microservicio).
 */
const SERVICIO_AUDITORIA_ADMIN = 'ADMIN_APPS';

/** Campos de credenciales que NUNCA deben quedar en la auditoría. */
const CAMPOS_SECRETOS_AUDITORIA = ['key', 'encryptionKey'];

/**
 * Funciones administrativas sobre la tabla `app`.
 *
 * `crearApp()` es HOY la única puerta de credenciales del sistema: genera
 * identificador + key + encryptionKey en una sola transacción.
 *  - `key`      → se guarda con hash scrypt (AuthService.hashKey) y se
 *                  devuelve CRUDA una única vez (el hash es irreversible).
 *  - `encryptionKey` → se guarda en claro (los servicios la necesitan para
 *                  cifrar/descifrar payloads) y también se devuelve.
 *
 * Los servicios de la app NO se asignan acá: la app nace con
 * app_servicios vacío (asignación en una función posterior).
 */
@Injectable()
export class AppsService {
  private readonly logger = new Logger(AppsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly applicationService: ApplicationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Ejecuta una operación administrativa y registra su resultado en la
   * auditoría (evento 'audit.record', fire-and-forget). Si la operación
   * falla, se audita el error antes de relanzarlo.
   *
   * `idApp` es la app administradora que ejecuta la acción (actor) y
   * `entidadId` la app afectada (si aplica). Las credenciales generadas se
   * enmascaran en `responsePayload` antes de persistirse.
   */
  private async auditarOperacion<T>(
    meta: {
      /** App administradora que ejecuta la acción. */
      idApp: number;
      operation: string;
      entidadName?: string;
      /** Id fijo o calculado a partir del resultado exitoso. */
      entidadId?: number | ((result: T) => number | undefined);
      requestPayload?: unknown;
      /** Resumen de la respuesta; por defecto el resultado completo. */
      responsePayload?: (result: T) => unknown;
      statusExito?: number;
    },
    ejecutar: () => Promise<T>,
  ): Promise<T> {
    try {
      const result = await ejecutar();
      const entidadId =
        typeof meta.entidadId === 'function'
          ? meta.entidadId(result)
          : meta.entidadId;
      this.emitirAuditoria({
        idApp: meta.idApp,
        operation: meta.operation,
        entidadName: meta.entidadName,
        entidadId,
        requestPayload: meta.requestPayload,
        responsePayload: meta.responsePayload
          ? meta.responsePayload(result)
          : result,
        status: meta.statusExito ?? 200,
      });
      return result;
    } catch (error: unknown) {
      const info = this.infoError(error);
      this.emitirAuditoria({
        idApp: meta.idApp,
        operation: meta.operation,
        entidadName: meta.entidadName,
        entidadId:
          typeof meta.entidadId === 'number' ? meta.entidadId : undefined,
        requestPayload: meta.requestPayload,
        responsePayload: { error: info.message },
        status: info.status,
        errorMessage: info.message,
      });
      throw error;
    }
  }

  /** Emite el evento que persiste la auditoría en segundo plano. */
  private emitirAuditoria(evento: {
    idApp: number;
    operation: string;
    entidadId?: number;
    entidadName?: string;
    requestPayload?: unknown;
    responsePayload?: unknown;
    status: number;
    errorMessage?: string;
  }): void {
    const payload: TransactionLogEvent = {
      servicio: SERVICIO_AUDITORIA_ADMIN,
      entidadId:
        evento.entidadId !== undefined ? BigInt(evento.entidadId) : undefined,
      entidadName: evento.entidadName,
      idApp: evento.idApp,
      operation: evento.operation,
      reference: '',
      requestPayload: evento.requestPayload ?? {},
      responsePayload: this.respuestaSeguraAuditoria(evento.responsePayload),
      status: evento.status,
      errorMessage: evento.errorMessage,
    };
    this.eventEmitter.emit('audit.record', payload);
  }

  /** Copia superficial de la respuesta con las credenciales enmascaradas. */
  private respuestaSeguraAuditoria(payload: unknown): Record<string, unknown> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {};
    }
    const limpio = { ...(payload as Record<string, unknown>) };
    for (const campo of CAMPOS_SECRETOS_AUDITORIA) {
      if (campo in limpio) {
        limpio[campo] = '***';
      }
    }
    return limpio;
  }

  /** Normaliza status/message de un error para la auditoría. */
  private infoError(error: unknown): { status: number; message: string } {
    const e = error as
      | {
          status?: number;
          statusCode?: number;
          message?: unknown;
          code?: string;
        }
      | undefined;
    return {
      status: e?.status ?? e?.statusCode ?? (e?.code === 'P2002' ? 409 : 500),
      message: typeof e?.message === 'string' ? e.message : 'Error desconocido',
    };
  }

  // ==========================================
  // OPERACIONES ADMINISTRATIVAS (AUDITADAS)
  // ==========================================

  async crearApp(idAppAdmin: number, dto: CrearAppDto) {
    return this.auditarOperacion(
      {
        idApp: idAppAdmin,
        operation: 'ADMIN_CREAR_APP',
        entidadName: 'app',
        entidadId: (creada) => creada.id_app,
        requestPayload: dto,
        statusExito: 201,
        responsePayload: (creada) => ({
          id_app: creada.id_app,
          identificador_app: creada.identificador_app,
          activo: creada.activo,
          info_app: creada.info_app,
          servicios: [] as number[],
          mensaje: creada.mensaje,
        }),
      },
      () => this.crearAppInterno(idAppAdmin, dto),
    );
  }

  private async crearAppInterno(idAppAdmin: number, dto: CrearAppDto) {
    const identificador = dto.identificador_app;

    // 1. Unicidad del identificador (también cubierta por el índice único
    //    de la BD, pero acá devolvemos un 409 legible).
    const existente = await this.prisma.app.findUnique({
      where: { identificador_app: identificador },
      select: { id_app: true },
    });
    if (existente) {
      throw new RpcException({
        statusCode: 409,
        message: `El identificador_app '${identificador}' ya está registrado (id_app=${existente.id_app})`,
        error: 'Conflict',
      });
    }

    // 2. Credenciales: la key sólo se expone en claro en ESTA respuesta.
    const key = randomBytes(KEY_LONGITUD_BYTES).toString('base64url');
    const keyHash = await this.authService.hashKey(key);
    const encryptionKey = this.applicationService.generarLlaveEncriptacion();

    const hoy = new Date();

    try {
      // 3. Alta atómica: app + info_app. Si algo falla, nada queda a medias.
      const creada = await this.prisma.$transaction(async (tx) => {
        return tx.app.create({
          data: {
            key: keyHash,
            activo: dto.activo ?? true,
            identificador_app: identificador,
            encryptionKey,
            fecha_creacion: hoy,
            fecha_actualizacion: hoy,
            info_app: {
              create: {
                nombre: dto.nombre,
                desarrollador: dto.desarrollador,
                ruc: dto.ruc,
              },
            },
          },
          include: { info_app: true },
        });
      });

      this.logger.log(
        `App registrada id_app=${creada.id_app} identificador=${identificador} ` +
          `por idAppAdmin=${idAppAdmin} (sin servicios asignados)`,
      );

      // 4. Credenciales en claro: NUNCA se repiten. El hash de la key y la
      //    encryptionKey almacenada no salen de acá.
      return {
        id_app: creada.id_app,
        identificador_app: creada.identificador_app,
        activo: creada.activo,
        key,
        encryptionKey,
        info_app: creada.info_app,
        servicios: [] as number[],
        mensaje:
          'App registrada. Guardá estas credenciales: la key se almacena ' +
          'hasheadada y NO se puede recuperar; la app todavía no tiene ' +
          'servicios asignados.',
      };
    } catch (error: unknown) {
      // Carrera contra otra alta con el mismo identificador → 409.
      // (P2002 = violación de índice único de Prisma.)
      const codigo = (error as { code?: string } | null)?.code;
      if (codigo === 'P2002') {
        throw new RpcException({
          statusCode: 409,
          message: `El identificador_app '${identificador}' ya está registrado`,
          error: 'Conflict',
        });
      }
      throw error;
    }
  }

  /**
   * Bloquea (activo = false) una app consumidora.
   *
   * `activo` es nullable en la BD (`Boolean?`): NULL se considera ACTIVA,
   * porque `validarCredencialesApp()` sólo rechaza `activo === false`. Por eso
   * el UPDATE alcanza `activo = true` y `activo = NULL` (un `NOT: { activo:
   * false }` de Prisma no matchea NULLs por la lógica de tres valores de SQL).
   *
   * El `updateMany` + `count` hace el cambio de estado atómico: dos requests
   * simultáneos no pueden pasar ambos el chequeo.
   *
   * El bloqueo NO revoca los JWT ya emitidos: impacta en el próximo login.
   */
  async bloquearApp(idApp: number, idAppAdmin: number) {
    return this.auditarOperacion(
      {
        idApp: idAppAdmin,
        operation: 'ADMIN_BLOQUEAR_APP',
        entidadName: 'app',
        entidadId: idApp,
        requestPayload: { idApp, idAppAdmin },
      },
      () => this.bloquearAppInterno(idApp, idAppAdmin),
    );
  }

  private async bloquearAppInterno(idApp: number, idAppAdmin: number) {
    if (idApp === idAppAdmin) {
      throw new RpcException({
        statusCode: 400,
        message: `La app con id_app=${idApp} no puede bloquearse a sí misma`,
        error: 'Bad Request',
      });
    }

    const { count } = await this.prisma.app.updateMany({
      where: {
        id_app: idApp,
        OR: [{ activo: true }, { activo: null }],
      },
      data: { activo: false, fecha_actualizacion: new Date() },
    });

    if (count === 0) {
      // O no existe, o ya estaba bloqueada: distinguimos para el status HTTP.
      const existe = await this.prisma.app.findUnique({
        where: { id_app: idApp },
        select: { id_app: true },
      });
      if (!existe) {
        throw new RpcException({
          statusCode: 404,
          message: `No se encontró la app con id_app=${idApp}`,
          error: 'Not Found',
        });
      }
      throw new RpcException({
        statusCode: 409,
        message: `La app con id_app=${idApp} ya está bloqueada`,
        error: 'Conflict',
      });
    }

    const bloqueada = await this.prisma.app.findUnique({
      where: { id_app: idApp },
      select: { identificador_app: true },
    });
    const identificador = bloqueada?.identificador_app ?? `id_app=${idApp}`;

    this.logger.log(
      `App bloqueada id_app=${idApp} identificador=${identificador} ` +
        `por idAppAdmin=${idAppAdmin}`,
    );

    return {
      id_app: idApp,
      identificador_app: bloqueada?.identificador_app ?? null,
      activo: false,
      mensaje:
        `App ${identificador} bloqueada. No podrá autenticarse en /auth/login; ` +
        'los tokens ya emitidos siguen vigentes hasta su expiración.',
    };
  }

  async listarApps(idAppAdmin: number) {
    return this.auditarOperacion(
      {
        idApp: idAppAdmin,
        operation: 'ADMIN_LISTAR_APPS',
        entidadName: 'app',
      },
      () => this.listarAppsInterno(),
    );
  }

  private async listarAppsInterno() {
    const apps = await this.prisma.app.findMany({
      include: { info_app: true, app_servicios: true },
    });

    return apps.map((app) => ({
      id_app: app.id_app,
      identificador_app: app.identificador_app,
      activo: app.activo,
      info_app: app.info_app,
    }));
  }

  async actualizarApp(idApp: number, dto: UpdateAppDto) {
    return this.auditarOperacion(
      {
        idApp,
        operation: 'ADMIN_ACTUALIZAR_APP',
        entidadName: 'app',
        entidadId: idApp,
        requestPayload: dto,
      },
      () => this.actualizarAppInterno(idApp, dto),
    );
  }

  private async actualizarAppInterno(idApp: number, dto: UpdateAppDto) {
    const appExistente = await this.prisma.app.findUnique({
      where: { id_app: idApp },
      select: {
        id_app: true,
        activo: true,
        identificador_app: true,
        info_app: {
          select: { nombre: true, desarrollador: true, ruc: true, email: true },
        },
      },
    });

    if (!appExistente) {
      throw new RpcException({
        statusCode: 404,
        message: `No se encontró la app con id_app=${idApp}`,
        error: 'Not Found',
      });
    }

    const updatedApp = await this.prisma.app.update({
      where: { id_app: idApp },
      data: {
        identificador_app: dto.identificador_app,
        info_app: {
          update: {
            nombre: dto.nombre ?? appExistente.info_app?.nombre,
            desarrollador:
              dto.desarrollador ?? appExistente.info_app?.desarrollador,
            ruc: dto.ruc ?? appExistente.info_app?.ruc,
            email: dto.email ?? appExistente.info_app?.email,
          },
        },
      },
      include: { info_app: true },
    });

    return updatedApp;
  }

  async nuevokeyApp(idApp: number, idAppAdmin: number) {
    return this.auditarOperacion(
      {
        idApp: idAppAdmin,
        operation: 'ADMIN_NUEVA_KEY_APP',
        entidadName: 'app',
        entidadId: idApp,
        requestPayload: { idApp, idAppAdmin },
      },
      () => this.nuevokeyAppInterno(idApp, idAppAdmin),
    );
  }

  private async nuevokeyAppInterno(idApp: number, idAppAdmin: number) {
    if (idApp === idAppAdmin) {
      throw new RpcException({
        statusCode: 400,
        message: `La app con id_app=${idApp} no puede generar una nueva key para sí misma`,
        error: 'Bad Request',
      });
    }

    const appExistente = await this.prisma.app.findUnique({
      where: { id_app: idApp },
      select: { id_app: true, identificador_app: true, key: true },
    });

    if (!appExistente) {
      throw new RpcException({
        statusCode: 404,
        message: `No se encontró la app con id_app=${idApp}`,
        error: 'Not Found',
      });
    }

    const key = randomBytes(KEY_LONGITUD_BYTES).toString('base64url');
    const keyHash = await this.authService.hashKey(key);

    await this.prisma.app.update({
      where: { id_app: idApp },
      data: { key: keyHash, fecha_actualizacion: new Date() },
    });

    this.logger.log(
      `Nueva key generada para app id_app=${idApp} identificador=${appExistente.identificador_app} ` +
        `por idAppAdmin=${idAppAdmin}`,
    );

    return {
      id_app: appExistente.id_app,
      identificador_app: appExistente.identificador_app,
      key,
      mensaje:
        'Se generó una nueva key para la app. Esta key se entrega en claro UNA sola vez ' +
        'igual que en el registro inicial; la key hasheada en BD no puede recuperarse. ' +
        'Los servicios de la app deberán actualizar su configuración con la nueva key.',
    };
  }

  async nuevoencryptionKeyApp(idApp: number, idAppAdmin: number) {
    return this.auditarOperacion(
      {
        idApp: idAppAdmin,
        operation: 'ADMIN_NUEVA_ENCRYPTION_KEY_APP',
        entidadName: 'app',
        entidadId: idApp,
        requestPayload: { idApp, idAppAdmin },
      },
      () => this.nuevoencryptionKeyAppInterno(idApp, idAppAdmin),
    );
  }

  private async nuevoencryptionKeyAppInterno(
    idApp: number,
    idAppAdmin: number,
  ) {
    if (idApp === idAppAdmin) {
      throw new RpcException({
        statusCode: 400,
        message: `La app con id_app=${idApp} no puede generar una nueva encryptionKey para sí misma`,
        error: 'Bad Request',
      });
    }

    const appExistente = await this.prisma.app.findUnique({
      where: { id_app: idApp },
      select: { id_app: true, identificador_app: true, encryptionKey: true },
    });

    if (!appExistente) {
      throw new RpcException({
        statusCode: 404,
        message: `No se encontró la app con id_app=${idApp}`,
        error: 'Not Found',
      });
    }

    const encryptionKey = this.applicationService.generarLlaveEncriptacion();

    await this.prisma.app.update({
      where: { id_app: idApp },
      data: { encryptionKey, fecha_actualizacion: new Date() },
    });

    this.logger.log(
      `Nueva encryptionKey generada para app id_app=${idApp} identificador=${appExistente.identificador_app} ` +
        `por idAppAdmin=${idAppAdmin}`,
    );

    return {
      id_app: appExistente.id_app,
      identificador_app: appExistente.identificador_app,
      encryptionKey,
      mensaje:
        'Se generó una nueva encryptionKey para la app. Esta key se entrega en claro UNA sola vez ' +
        'igual que en el registro inicial; la encryptionKey almacenada en BD no puede recuperarse. ' +
        'Los servicios de la app deberán actualizar su configuración con la nueva encryptionKey.',
    };
  }

  /**
   * Asigna uno o más servicios a una app (por sus códigos numéricos).
   * Sustituye cualquier asignación previa de servicios para esta app.
   *
   * Los servicios que no existan en la tabla `servicios` serán ignorados.
   * Después de la asignación, la app dispondrá de exactamente los servicios
   * indicados (los demás se eliminarán de `app_servicios`).
   *
   * Emite auditoría con `operation: 'ADMIN_ASIGNAR_SERVICIOS_APP'`.
   */
  async asignarServiciosApp(idApp: number, codigos: string[]) {
    // Deduplicar entrada por si el caller envía repetidos
    const codigosUniq = [...new Set(codigos)];

    // Validar que ningún código empiece por "ADMIN" (mayúsculas o minúsculas),
    // ya que solo debe existir un administrador en el sistema.
    const codigoAdmin = codigosUniq.find(
      (c) => c.toUpperCase().startsWith('ADMIN'),
    );
    if (codigoAdmin) {
      throw new RpcException({
        statusCode: 400,
        message: `No se pueden asignar servicios con código que empiece por "ADMIN": "${codigoAdmin}". ` +
          'Sólo debe haber un administrador en el sistema.',
        error: 'Bad Request',
      });
    }

    return this.auditarOperacion(
      {
        idApp,
        operation: 'ADMIN_ASIGNAR_SERVICIOS_APP',
        entidadName: 'app',
        entidadId: idApp,
        requestPayload: { idApp, codigos: codigosUniq },
        responsePayload: (result) => ({
          idApp,
          codigosAsignados: result,
        }),
        statusExito: 200,
      },
      async () => {
        // 1. Eliminar asignaciones previas de esta app
        await this.prisma.app_servicios.deleteMany({
          where: { id_app: idApp },
        });

        // 2. Buscar los servicios por su codigo alfanumérico
        if (codigosUniq && codigosUniq.length > 0) {
          const serviciosValidos = await this.prisma.servicios.findMany({
            where: { codigo: { in: codigosUniq }, activo: true },
            select: { id_servicio: true, codigo: true, nombre: true, activo: true },
          });
          const mapaCodigos = new Map(
            serviciosValidos.map((s) => [s.codigo, s.id_servicio]),
          );

          // Identificar cuáles códigos no fueron encontrados o no están activos
          const codigosEncontrados = new Set(serviciosValidos.map((s) => s.codigo));
          const codigosNoValidos = codigosUniq.filter(
            (c) => !codigosEncontrados.has(c.toUpperCase()),
          );

          // Si hay códigos no válidos, lanzar error informando cuáles son
          if (codigosNoValidos.length > 0) {
            throw new RpcException({
              statusCode: 400,
              message: `Los siguientes códigos de servicio no existen o están inactivos: ${codigosNoValidos.join(', ')}. ` +
                'Sólo se pueden asignar servicios con codigo activo.',
              error: 'Bad Request',
            });
          }

          // Filtrar solo los códigos que existen y mapear a id_servicio
          const registros = codigosUniq
            .filter((codigo) => mapaCodigos.has(codigo))
            .map((codigo) => ({
              id_app: idApp,
              id_servicio: mapaCodigos.get(codigo)!,
            }));

          if (registros.length > 0) {
            await this.prisma.app_servicios.createMany({
              data: registros,
              skipDuplicates: true,
            });
          }
        }

        // 3. Devolver el listado actual de servicios de la app (codigos + nombres)
        const asignaciones = await this.prisma.app_servicios.findMany({
          where: { id_app: idApp },
          include: { servicios: { select: { codigo: true, nombre: true } } },
        });

        return asignaciones.map((a) => ({
          id_servicio: a.id_servicio,
          ...a.servicios,
        }));
      },
    );
  }

  async listarServicios() {
    return this.prisma.servicios.findMany({
      select: { codigo: true, nombre: true, descripcion: true, activo: true },
      where: { codigo: { not: { startsWith: 'ADMIN' } } }, // Excluir servicios que empiezan con "ADMIN"
    });
  }
}
