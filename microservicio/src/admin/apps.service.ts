import { Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ApplicationService } from '../servicios/application.service';
import { CrearAppDto } from '../dto/crear-app.dto';

/** Largo de la key de login generada (24 bytes → 32 chars base64url). */
const KEY_LONGITUD_BYTES = 24;

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
  ) {}

  async crearApp(idAppAdmin: number, dto: CrearAppDto) {
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


  async listarApps() {
    const apps = await this.prisma.app.findMany({
      include: { info_app: true, app_servicios: true },
    });

    return apps.map((app) => ({
      id_app: app.id_app,
      identificador_app: app.identificador_app,
      activo: app.activo,
      info_app: app.info_app
    }));
  }
}
