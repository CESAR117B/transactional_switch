import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { hashBusqueda } from '../servicios/hash-busqueda';
import { UniversalCryptoService } from '../servicios/universal-crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  cifrarPayloadPago,
  cifrarPayloadTransferencia,
  mapearDetalle,
  normalizarDetallePago,
  normalizarDetalleTransferencia,
} from './detalle.mapper';
import {
  DatosPago,
  DatosTransferencia,
  EstadoTransaccion,
  OPERACIONES_PRODUBANCO,
  TxConDetalles,
} from './produbanco.types';
import { comoObjeto, normalizarNombreApp, sha256 } from './produbanco.utils';

/**
 * Persistencia de lotes Produbanco: cabecera + detalles cifrados, hashes de
 * búsqueda, referencias, idempotencia y resolución de transacciones.
 * No arma tramas ni consulta al banco.
 */
@Injectable()
export class LotesRepository {
  /** Ventana del límite anti-duplicado (mismo monto + misma cuenta por app). */
  private static readonly VENTANA_DUPLICADO_MINUTOS = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly universalCryptoService: UniversalCryptoService,
  ) {}

  // ==========================================
  // LLAVES DE CIFRADO
  // ==========================================

  async getEncryptionKey(idApp: number): Promise<string> {
    const appRecord = await this.prisma.app.findUnique({
      where: { id_app: idApp },
      select: { encryptionKey: true },
    });
    if (!appRecord || !appRecord.encryptionKey) {
      throw new RpcException({
        statusCode: 500,
        message: `La app con ID ${idApp} no tiene llave de encriptación configurada. La encryptionKey se genera por defecto al registrar la app (POST /admin/apps); en apps antiguas debe asignarla el administrador. El cliente desencripta con la misma llave.`,
      });
    }
    if (appRecord.encryptionKey.length !== 32) {
      throw new RpcException({
        statusCode: 500,
        message: `La llave de encriptación de la app ${idApp} debe tener exactamente 32 caracteres.`,
      });
    }
    return appRecord.encryptionKey;
  }

  /**
   * Valida que la llave enviada por la app cliente coincida con la
   * registrada en BD y la devuelve para desencriptado y hash de búsqueda.
   * Comparación timing-safe.
   */
  async validarLlaveCliente(
    idApp: number,
    llaveCliente: unknown,
  ): Promise<string> {
    if (typeof llaveCliente !== 'string' || llaveCliente.trim() === '') {
      throw new RpcException({
        statusCode: 400,
        message:
          'llaveDesencriptacion es requerida (header X-Encryption-Key) y no puede estar vacía.',
      });
    }
    const appRecord = await this.prisma.app.findUnique({
      where: { id_app: idApp },
      select: { encryptionKey: true },
    });
    if (!appRecord || !appRecord.encryptionKey) {
      throw new RpcException({
        statusCode: 500,
        message: `La app con ID ${idApp} no tiene llave de encriptación configurada. La encryptionKey se genera por defecto al registrar la app (POST /admin/apps); en apps antiguas debe asignarla el administrador.`,
      });
    }
    const registrada = appRecord.encryptionKey;
    if (llaveCliente.length !== 32) {
      throw new RpcException({
        statusCode: 400,
        message: 'llaveDesencriptacion debe tener exactamente 32 caracteres.',
      });
    }
    // Mismo largo garantizado (32 vs 32) antes de timingSafeEqual.
    const mismoValor =
      registrada.length === llaveCliente.length &&
      crypto.timingSafeEqual(
        Buffer.from(registrada, 'utf8'),
        Buffer.from(llaveCliente, 'utf8'),
      );
    if (!mismoValor) {
      throw new RpcException({
        statusCode: 401,
        message: 'Llave de encriptación inválida para esta App.',
      });
    }
    return llaveCliente;
  }

  /**
   * Referencia del lote generada por el back:
   * NOMBREAPP-{secuencia}-{yyyyMMddHHmmss}-{4 hex}.
   * - nombre = info_app.nombre (fallback APP{idApp})
   * - secuencia = COUNT(transacciones de la app) + 1, 5 dígitos
   * - timestamp + 4 hex garantizan unicidad (referenceHash es UNIQUE)
   */
  async generarReferenciaLote(idApp: number): Promise<string> {
    const info = await this.prisma.info_app.findUnique({
      where: { id_app: idApp },
      select: { nombre: true },
    });
    const nombre = normalizarNombreApp(info?.nombre) ?? `APP${idApp}`;
    const total = await this.prisma.transaccionesServicios.count({
      where: { idApp },
    });
    const secuencia = String(total + 1).padStart(5, '0');
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, '')
      .substring(0, 14);
    const sufijo = crypto.randomBytes(2).toString('hex');
    return `${nombre}-${secuencia}-${timestamp}-${sufijo}`;
  }

  // ==========================================
  // IDEMPOTENCIA
  // ==========================================

  /** Busca la transacción creada con esta Idempotency-Key para la app. */
  buscarPorIdempotencyKey(
    idApp: number,
    idempotencyKey: string,
  ): Promise<TxConDetalles | null> {
    return this.prisma.transaccionesServicios.findUnique({
      where: { idApp_idempotencyKey: { idApp, idempotencyKey } },
      include: { detalles: { orderBy: { secuencia: 'asc' } } },
    });
  }

  /**
   * Si la creación falló por la unique (idApp, idempotencyKey), otro
   * reintento ganó la carrera: devuelve su fila para resolverla como
   * reintento. Cualquier otro error se propaga.
   */
  async conflictoIdempotencia(
    idApp: number,
    idempotencyKey: string,
    error: unknown,
  ): Promise<TxConDetalles | null> {
    const esUnique =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002';
    if (!esUnique) return null;
    return this.buscarPorIdempotencyKey(idApp, idempotencyKey);
  }

  /** Respuesta pública de una transacción ya confirmada por el banco. */
  respuestaDeTransaccion(tx: TxConDetalles): {
    referenciaLote: string;
    montoTotal: number;
  } {
    const req = comoObjeto(tx.requestPayload);
    const detalles = Array.isArray(req['detalles']) ? req['detalles'] : [];
    const montoTotal = detalles.reduce((acc, detalle) => {
      const item = comoObjeto(detalle);
      const monto = Number(item['monto']);
      return acc + (Number.isFinite(monto) ? monto : 0);
    }, 0);
    return { referenciaLote: tx.reference, montoTotal };
  }

  // ==========================================
  // PERSISTENCIA DEL LOTE
  // ==========================================

  /**
   * Crea cabecera + detalles del pago local en estado PENDIENTE.
   * Cifra cuentaEmpresa, identificacion, cuenta y reference.
   */
  async guardarTransaccionPagoBD(
    idApp: number,
    data: DatosPago,
    requestHash: string,
    idempotencyKey: string,
  ) {
    const secretKey = await this.getEncryptionKey(idApp);
    const referenceEncrypted = this.universalCryptoService.encrypt(
      data.referenciaLote ?? '',
      secretKey,
    );
    const referenceHash = sha256(data.referenciaLote ?? '');
    const payloadCifrado = cifrarPayloadPago(
      data,
      referenceEncrypted,
      secretKey,
      this.universalCryptoService,
    );

    // La idempotencia la resuelve la unique (idApp, idempotencyKey): si otro
    // reintento ya creó la fila, Prisma lanza P2002 y el caller reconcilia.
    return this.prisma.transaccionesServicios.create({
      data: {
        servicio: 'PRODUBANCO',
        idApp,
        operation: 'SPR_PRODUBANCO-PAGO',
        reference: referenceEncrypted,
        referenceHash,
        requestHash,
        idempotencyKey,
        requestPayload: payloadCifrado,
        responsePayload: {},
        status: EstadoTransaccion.PENDIENTE,
        detalles: {
          create: data.detalles.map((item, indice) =>
            mapearDetalle(
              normalizarDetallePago(item),
              indice + 1,
              secretKey,
              data,
              this.universalCryptoService,
            ),
          ),
        },
      },
    });
  }

  /**
   * Crea cabecera + detalles de la transferencia al exterior en estado
   * PENDIENTE. Cifra cuentaEmpresa, identificación, cuenta destino, SWIFT
   * y reference.
   */
  async guardarTransaccionTransferenciaBD(
    idApp: number,
    data: DatosTransferencia,
    requestHash: string,
    idempotencyKey: string,
  ) {
    const secretKey = await this.getEncryptionKey(idApp);
    const referenceEncrypted = this.universalCryptoService.encrypt(
      data.referenciaLote ?? '',
      secretKey,
    );
    const referenceHash = sha256(data.referenciaLote ?? '');
    const payloadCifrado = cifrarPayloadTransferencia(
      data,
      referenceEncrypted,
      secretKey,
      this.universalCryptoService,
    );

    return this.prisma.transaccionesServicios.create({
      data: {
        servicio: 'PRODUBANCO',
        idApp,
        operation: 'SPR_PRODUBANCO-TRANSFERENCIA_EXTERIOR',
        reference: referenceEncrypted,
        referenceHash,
        requestHash,
        idempotencyKey,
        requestPayload: payloadCifrado,
        responsePayload: {},
        status: EstadoTransaccion.PENDIENTE,
        detalles: {
          create: data.detalles.map((item, indice) =>
            mapearDetalle(
              normalizarDetalleTransferencia(item),
              indice + 1,
              secretKey,
              data,
              this.universalCryptoService,
            ),
          ),
        },
      },
    });
  }

  /**
   * Actualiza la transacción a éxito cuando Produbanco retorna el Envio_Id.
   * `estadoServicio` guarda el <Estado> verbatim y `cargaRespuestaBanco`
   * conserva el XML crudo (diagnóstico, máx 4000 chars).
   */
  actualizarTransaccionExitoBD(
    idTransaccion: bigint,
    envioId: string,
    estado: string,
    respuesta: string,
  ) {
    return this.prisma.transaccionesServicios.update({
      where: { idTransaccion },
      data: {
        status: EstadoTransaccion.PROCESADO_BANCO,
        estadoServicio: estado || null,
        responsePayload: {
          envioId,
          mensaje: 'Carga aceptada correctamente por Produbanco',
          cargaRespuestaBanco: respuesta.substring(0, 4000),
        },
      },
    });
  }

  /**
   * Marca la transacción con estado de error por fallo de red/SOAP o
   * rechazo del banco. `respuestaBanco` conserva la respuesta cruda.
   */
  actualizarTransaccionErrorBD(
    idTransaccion: bigint,
    mensajeError: string,
    respuestaBanco?: string | null,
  ) {
    return this.prisma.transaccionesServicios.update({
      where: { idTransaccion },
      data: {
        status: EstadoTransaccion.ERROR,
        errorMessage: mensajeError,
        responsePayload: {
          error: mensajeError,
          ...(respuestaBanco
            ? { cargaRespuestaBanco: respuestaBanco.substring(0, 4000) }
            : {}),
        },
      },
    });
  }

  // ==========================================
  // RESOLUCIÓN DE TRANSACCIONES
  // ==========================================

  /**
   * Resuelve una transacción de Produbanco por un único campo `dato` SIN
   * acotar a una app (uso administrativo): si es numérico se intenta como
   * idTransaccion y, si no existe, como referenciaLote (y viceversa).
   * Solo permite operaciones de Produbanco (PAGO o TRANSFERENCIA_EXTERIOR).
   */
  async buscarTransaccionPorDato(
    datoEntrada?: string | number,
  ): Promise<TxConDetalles> {
    const dato =
      datoEntrada !== undefined && datoEntrada !== null
        ? String(datoEntrada).trim()
        : '';
    if (!dato) {
      throw new RpcException({
        statusCode: 400,
        message: 'Se requiere el campo dato (idTransaccion o referenciaLote).',
      });
    }

    const include = { detalles: { orderBy: { secuencia: 'asc' as const } } };
    const esNumerico = /^\d+$/.test(dato);
    const filtroOperacion = { in: OPERACIONES_PRODUBANCO };

    const buscarPorId = async () => {
      if (!esNumerico) return null;
      return this.prisma.transaccionesServicios.findFirst({
        where: { idTransaccion: BigInt(dato), operation: filtroOperacion },
        include,
      });
    };
    const buscarPorReferencia = async () => {
      const hash = sha256(dato);
      return this.prisma.transaccionesServicios.findFirst({
        where: { referenceHash: hash, operation: filtroOperacion },
        include,
      });
    };

    let tx: TxConDetalles | null;
    if (esNumerico) {
      tx = await buscarPorId();
      if (!tx) tx = await buscarPorReferencia();
    } else {
      tx = await buscarPorReferencia();
    }

    if (!tx) {
      throw new RpcException({
        statusCode: 404,
        message: 'Transacción no encontrada.',
      });
    }
    return tx;
  }

  /**
   * Resuelve la transacción por `dato` y verifica que pertenezca a la app
   * (404 en caso contrario, sin filtrar existencia entre apps).
   */
  async resolverTransaccion(
    idApp: number,
    params: { dato?: string | number },
  ): Promise<TxConDetalles> {
    const tx = await this.buscarTransaccionPorDato(params.dato);
    if (tx.idApp !== idApp) {
      throw new RpcException({
        statusCode: 404,
        message: 'Transacción no encontrada.',
      });
    }
    return tx;
  }

  /**
   * Datos de presentación y llave de descifrado de las apps indicadas,
   * indexados por id_app. El admin descifra con la key de la app dueña.
   */
  async datosApps(idApps: number[]): Promise<
    Map<
      number,
      {
        identificadorApp: string | null;
        nombreApp: string | null;
        encryptionKey: string | null;
      }
    >
  > {
    const ids = [...new Set(idApps)];
    const apps =
      ids.length === 0
        ? []
        : await this.prisma.app.findMany({
            where: { id_app: { in: ids } },
            select: {
              id_app: true,
              identificador_app: true,
              encryptionKey: true,
              info_app: { select: { nombre: true } },
            },
          });

    return new Map(
      apps.map((app) => [
        app.id_app,
        {
          identificadorApp: app.identificador_app,
          nombreApp: app.info_app?.nombre ?? null,
          encryptionKey: app.encryptionKey ?? null,
        },
      ]),
    );
  }

  // ==========================================
  // LÍMITE ANTI-DUPLICADO
  // ==========================================

  /**
   * Rechaza con 409 si ya existe una transacción de ESTA app con el mismo
   * monto a la misma cuenta beneficiario en los últimos minutos.
   * - Busca por beneficiarioCuentaHash (HMAC con la key de la app).
   * - Excluye status ERROR: un fallo previo permite reintentar.
   * - Ítems sin cuenta (CHQ/EFE) no aplican.
   * - Best-effort: dos peticiones simultáneas podrían pasar ambas.
   */
  async validarDuplicadosRecientes(
    idApp: number,
    items: Array<{ cuenta?: string; monto: number }>,
  ): Promise<void> {
    const secretKey = await this.getEncryptionKey(idApp);
    const desde = new Date(
      Date.now() - LotesRepository.VENTANA_DUPLICADO_MINUTOS * 60 * 1000,
    );

    for (const item of items) {
      if (!item.cuenta) continue;

      const duplicado =
        await this.prisma.transaccionesBancariasDetalle.findFirst({
          where: {
            beneficiarioCuentaHash: hashBusqueda(item.cuenta, secretKey),
            monto: item.monto,
            createdAt: { gte: desde },
            transaccionServicio: {
              idApp,
              status: { not: EstadoTransaccion.ERROR },
            },
          },
          select: { idTransaccion: true, createdAt: true },
        });

      if (duplicado) {
        throw new RpcException({
          statusCode: 409,
          message:
            `Duplicado: ya existe una transacción de esta app con el mismo monto ` +
            `(${item.monto}) a la misma cuenta beneficiario en los últimos ` +
            `${LotesRepository.VENTANA_DUPLICADO_MINUTOS} minutos ` +
            `(idTransaccion=${duplicado.idTransaccion}, creada=${duplicado.createdAt.toISOString()}). ` +
            `Intente con otro monto/cuenta o espere a que venza la ventana.`,
          error: 'Conflict',
        });
      }
    }
  }
}
