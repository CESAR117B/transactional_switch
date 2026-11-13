import { Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Prisma } from '@prisma/client';
import { ConfigDbService } from '../config-db/config-db.service';
import {
  ProdubancoSoapService,
  TramaSoap,
} from '../integraciones/produbanco-soap.service';
import { PrismaService } from '../prisma/prisma.service';
import { hashBusqueda } from '../servicios/hash-busqueda';
import { UniversalCryptoService } from '../servicios/universal-crypto.service';
import { LotesRepository } from './lotes.repository';
import {
  EstadoBanco,
  EstadoTransaccion,
  MovimientoBanco,
  OPERACIONES_PRODUBANCO,
  SobreBanco,
  TxConDetalles,
  TxListado,
} from './produbanco.types';
import {
  aTexto,
  comoObjeto,
  infoError,
  operacionValida,
  textoEstado,
} from './produbanco.utils';

/**
 * Consulta de transacciones Produbanco: listados para la app y el admin,
 * detalle en vivo contra el banco y sincronización de estados en BD.
 */
@Injectable()
export class ConsultaTransaccionesService {
  private readonly logger = new Logger(ConsultaTransaccionesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly soapProdubanco: ProdubancoSoapService,
    private readonly universalCryptoService: UniversalCryptoService,
    private readonly configDb: ConfigDbService,
    private readonly lotes: LotesRepository,
  ) {}

  // ==========================================
  // CONSULTA DE ESTADO PARA APPS REGISTRADAS
  // ==========================================

  /**
   * Lista las transacciones de una app (paginado), con estado local y
   * totales. La referencia se desencripta con la llave de la app antes de
   * responder. Filtros opcionales: fecha de creación (DD/MM/YYYY, horario
   * Ecuador), cédula y cuenta del beneficiario (hash de búsqueda).
   */
  async consultarTransacciones(
    idApp: number,
    params: {
      page?: number;
      pageSize?: number;
      status?: number;
      operation?: string;
      fechaDesde?: string;
      fechaHasta?: string;
      cedula?: string;
      cuenta?: string;
      /** EncryptionKey de la app, obligatoria: se valida contra BD y se usa
       * para desencriptar la respuesta y para el hash de búsqueda. */
      llaveDesencriptacion?: string;
    },
  ) {
    const page = Math.max(1, Math.trunc(Number(params.page) || 1));
    const pageSize = Math.min(
      50,
      Math.max(1, Math.trunc(Number(params.pageSize) || 20)),
    );
    const where: Prisma.TransaccionesServiciosWhereInput = {
      idApp,
      operation: { in: OPERACIONES_PRODUBANCO },
    };
    if (
      params.status !== undefined &&
      params.status !== null &&
      [1, 2, 3].includes(Number(params.status))
    ) {
      where.status = Number(params.status);
    }
    const operation = operacionValida(params.operation);
    if (operation) {
      where.operation = operation;
    }

    // Fecha de creación (created_at se almacena en UTC; Ecuador = UTC-5 fijo)
    const rango = this.rangoCreacion(params.fechaDesde, params.fechaHasta);
    if (rango) {
      where.createdAt = rango;
    }

    // Beneficiario: cédula y/o cuenta se buscan por hash determinista; ambos
    // criterios deben cumplirse en el MISMO detalle (AND dentro de `some`).
    const secretKey = await this.lotes.validarLlaveCliente(
      idApp,
      params.llaveDesencriptacion,
    );
    const cedula = params.cedula?.trim();
    const cuenta = params.cuenta?.trim();
    if (cedula || cuenta) {
      const detalle: Prisma.TransaccionesBancariasDetalleWhereInput = {};
      if (cedula) {
        detalle.beneficiarioIdentificacionHash = hashBusqueda(
          cedula,
          secretKey,
        );
      }
      if (cuenta) {
        detalle.beneficiarioCuentaHash = hashBusqueda(cuenta, secretKey);
      }
      where.detalles = { some: detalle };
    }

    const [total, items] = await Promise.all([
      this.prisma.transaccionesServicios.count({ where }),
      this.prisma.transaccionesServicios.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          detalles: {
            select: {
              secuencia: true,
              monto: true,
              estadoItem: true,
              beneficiarioIdentificacion: true,
              beneficiarioCuenta: true,
            },
            orderBy: { secuencia: 'asc' },
          },
        },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: items.map((tx) => this.formatearListado(tx, secretKey)),
    };
  }

  /**
   * Detalle de estado de una transacción para la app cliente: consulta en
   * vivo a Produbanco (ConsultaOrdenes por Envio_Id y, opcionalmente,
   * ConsultaMovimientos por Id_Sobre) y sincroniza la BD con la respuesta.
   * El detalle crudo del banco NO se devuelve: sólo el resumen persistido.
   * Si el Envio_Id no sirve se consulta por la Referencia (§2.2.1).
   * Un fallo del banco NO rompe la respuesta.
   */
  async consultarEstadoTransaccion(
    idApp: number,
    params: {
      dato?: string | number;
      llaveDesencriptacion?: string;
    },
  ) {
    const secretKey = await this.lotes.validarLlaveCliente(
      idApp,
      params.llaveDesencriptacion,
    );
    const tx = await this.lotes.resolverTransaccion(idApp, params);
    await this.consultarBanco(tx, secretKey);

    return this.formatearDetalleTransaccion(tx, secretKey);
  }

  // ==========================================
  // CONSULTA ADMINISTRATIVA (TODAS LAS APPS)
  // ==========================================

  /**
   * Lista las transacciones de Produbanco de TODAS las apps (solo admin).
   * La data sensible se desencripta con la encryptionKey de CADA app leída
   * de BD. `cedula`/`cuenta` requieren `idApp` porque el hash es un HMAC
   * con la llave de la app.
   */
  async transaccionesAdmin(
    params: {
      page?: number;
      pageSize?: number;
      status?: number;
      operation?: string;
      fechaDesde?: string;
      fechaHasta?: string;
      cedula?: string;
      cuenta?: string;
      idApp?: number;
    } = {},
  ) {
    const page = Math.max(1, Math.trunc(Number(params.page) || 1));
    const pageSize = Math.min(
      50,
      Math.max(1, Math.trunc(Number(params.pageSize) || 20)),
    );
    const where: Prisma.TransaccionesServiciosWhereInput = {
      operation: { in: OPERACIONES_PRODUBANCO },
    };
    if (
      params.status !== undefined &&
      params.status !== null &&
      [1, 2, 3].includes(Number(params.status))
    ) {
      where.status = Number(params.status);
    }
    const operation = operacionValida(params.operation);
    if (operation) {
      where.operation = operation;
    }

    const idApp =
      params.idApp !== undefined && params.idApp !== null
        ? Number(params.idApp)
        : undefined;
    if (idApp !== undefined) {
      if (!Number.isInteger(idApp) || idApp <= 0) {
        throw new RpcException({
          statusCode: 400,
          message: 'idApp debe ser un entero positivo.',
        });
      }
      where.idApp = idApp;
    }

    const rango = this.rangoCreacion(params.fechaDesde, params.fechaHasta);
    if (rango) {
      where.createdAt = rango;
    }

    // El hash depende de la encryptionKey de la app: la búsqueda global
    // exige acotar a una app (idApp).
    const cedula = params.cedula?.trim();
    const cuenta = params.cuenta?.trim();
    if (cedula || cuenta) {
      if (idApp === undefined) {
        throw new RpcException({
          statusCode: 400,
          message:
            'Para buscar por cedula/cuenta en el listado admin se requiere idApp: ' +
            'el hash de búsqueda se calcula con la encryptionKey de cada app.',
        });
      }
      const secretKey = await this.lotes.getEncryptionKey(idApp);
      const detalle: Prisma.TransaccionesBancariasDetalleWhereInput = {};
      if (cedula) {
        detalle.beneficiarioIdentificacionHash = hashBusqueda(
          cedula,
          secretKey,
        );
      }
      if (cuenta) {
        detalle.beneficiarioCuentaHash = hashBusqueda(cuenta, secretKey);
      }
      where.detalles = { some: detalle };
    }

    const [total, items] = await Promise.all([
      this.prisma.transaccionesServicios.count({ where }),
      this.prisma.transaccionesServicios.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          detalles: {
            select: {
              secuencia: true,
              monto: true,
              estadoItem: true,
              beneficiarioIdentificacion: true,
              beneficiarioCuenta: true,
            },
            orderBy: { secuencia: 'asc' },
          },
        },
      }),
    ]);

    // Llaves y datos de presentación de las apps presentes en la página.
    const apps = await this.lotes.datosApps(items.map((tx) => tx.idApp));

    return {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: items.map((tx) => {
        const app = apps.get(tx.idApp);
        return {
          ...this.formatearListado(tx, app?.encryptionKey ?? null),
          appId: tx.idApp,
          appIdentificador: app?.identificadorApp ?? null,
          appNombre: app?.nombreApp ?? null,
        };
      }),
    };
  }

  /**
   * Estado de una transacción de Produbanco de CUALQUIER app (solo admin).
   * Misma lógica en vivo que consultarEstadoTransaccion, pero resuelve por
   * `dato` sin exigir la app y descifra con la key de la app dueña.
   */
  async estadoTransaccionAdmin(
    params: {
      dato?: string | number;
      idApp?: number;
    } = {},
  ) {
    const tx = await this.lotes.buscarTransaccionPorDato(params.dato);

    if (params.idApp !== undefined && params.idApp !== null) {
      const idApp = Number(params.idApp);
      if (!Number.isInteger(idApp) || idApp <= 0) {
        throw new RpcException({
          statusCode: 400,
          message: 'idApp debe ser un entero positivo.',
        });
      }
      if (tx.idApp !== idApp) {
        throw new RpcException({
          statusCode: 404,
          message: 'Transacción no encontrada.',
        });
      }
    }

    const secretKey = await this.lotes.getEncryptionKey(tx.idApp);
    const banco = await this.consultarBanco(tx, secretKey);
    const apps = await this.lotes.datosApps([tx.idApp]);
    const app = apps.get(tx.idApp);

    return {
      ...this.formatearDetalleTransaccion(tx, secretKey),
      appId: tx.idApp,
      appIdentificador: app?.identificadorApp ?? null,
      appNombre: app?.nombreApp ?? null,
      banco,
    };
  }

  /**
   * Sincroniza en BD el estado de una transacción de Produbanco consultando
   * el banco en vivo, sin exigir la app ni la llave del cliente: descifra
   * con la encryptionKey registrada de la app dueña. Pensado para el cron.
   *
   * Devuelve null si la transacción no existe o no es de Produbanco. Los
   * fallos del banco NO lanzan: consultarBanco los reporta en `error`.
   */
  async sincronizarEstadoProdubanco(
    idTransaccion: bigint,
  ): Promise<EstadoBanco | null> {
    const tx = await this.prisma.transaccionesServicios.findFirst({
      where: {
        idTransaccion,
        operation: { in: OPERACIONES_PRODUBANCO },
      },
      include: { detalles: { orderBy: { secuencia: 'asc' } } },
    });
    if (!tx) return null;
    const secretKey = await this.lotes.getEncryptionKey(tx.idApp);
    return this.consultarBanco(tx, secretKey);
  }

  // ==========================================
  // HELPERS DE CONSULTA
  // ==========================================

  /**
   * Rango inclusivo [00:00:00.000, 23:59:59.999] de un día en horario
   * Ecuador (UTC-5, sin DST) a partir de DD/MM/YYYY, para filtrar
   * `createdAt` (UTC). Lanza RpcException 400 con fecha inválida o si
   * desde > hasta.
   */
  private rangoCreacion(
    fechaDesde?: string,
    fechaHasta?: string,
  ): { gte?: Date; lte?: Date } | null {
    const dia = (fecha: string, inicio: boolean): number => {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fecha.trim());
      if (!m) {
        throw new RpcException({
          statusCode: 400,
          message: `Fecha inválida '${fecha}': use el formato DD/MM/YYYY`,
        });
      }
      const [, dd, mm, yyyy] = m.map(Number);
      // 00:00 Ecuador = 05:00Z; el re-control detecta días inexistentes
      const inicioDia = Date.UTC(yyyy, mm - 1, dd, 5);
      const check = new Date(inicioDia);
      if (
        check.getUTCDate() !== dd ||
        check.getUTCMonth() !== mm - 1 ||
        check.getUTCFullYear() !== yyyy
      ) {
        throw new RpcException({
          statusCode: 400,
          message: `Fecha de calendario inexistente '${fecha}'`,
        });
      }
      return inicio ? inicioDia : inicioDia + 86_400_000 - 1;
    };

    const desde = fechaDesde?.trim() ? dia(fechaDesde, true) : undefined;
    const hasta = fechaHasta?.trim() ? dia(fechaHasta, false) : undefined;
    if (desde !== undefined && hasta !== undefined && desde > hasta) {
      throw new RpcException({
        statusCode: 400,
        message: 'fechaDesde no puede ser mayor que fechaHasta',
      });
    }
    if (desde === undefined && hasta === undefined) return null;
    return {
      ...(desde !== undefined ? { gte: new Date(desde) } : {}),
      ...(hasta !== undefined ? { lte: new Date(hasta) } : {}),
    };
  }

  /**
   * Consulta el estado en vivo en Produbanco y sincroniza la BD local:
   * ConsultaOrdenes por Envio_Id y, opcionalmente, ConsultaMovimientos por
   * Id_Sobre. Si el Envio_Id no sirve se consulta por la Referencia del
   * lote; `banco.consultaPor` indica el modo usado. Un fallo del banco NO
   * rompe la respuesta: se reporta en `banco.error`.
   */
  async consultarBanco(
    tx: TxConDetalles,
    secretKey: string,
  ): Promise<EstadoBanco> {
    let banco: EstadoBanco = { consultado: false };
    const response = comoObjeto(tx.responsePayload);
    const envioId =
      typeof response['envioId'] === 'string' ? response['envioId'] : null;
    // Envio_Id usable como idBuzon: numérico y distinto de "0".
    const envioIdUtil =
      envioId && /^\d+$/.test(envioId) && envioId !== '0' ? envioId : null;
    const referenciaLote = this.desencriptarSeguro(tx.reference, secretKey);
    const req = comoObjeto(tx.requestPayload);
    // idServicio SÓLO viene en el request (varía por operación); idEmpresa
    // se inyecta desde config al crear el lote y queda en requestPayload
    // (fallback a config por si algún lote no lo guardó).
    const idServicio = aTexto(req['idServicio']);
    let idEmpresa = aTexto(req['idEmpresa']);
    if (!idEmpresa) {
      try {
        const cfg = await this.configDb.getProdubancoConfig();
        idEmpresa = cfg.idempresa;
      } catch (error: unknown) {
        this.logger.warn(
          `Sin idEmpresa en requestPayload ni en config: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (!idEmpresa || !idServicio) {
      banco.motivo =
        'requestPayload sin idEmpresa/idServicio; se reporta solo el estado local.';
      return banco;
    }

    // Sin Envio_Id usable no se puede consultar por idBuzon; sin referencia
    // registrada tampoco hay filtro fiable: no consultar (evita traer una
    // orden ajena y sincronizar la transacción equivocada).
    if (!envioIdUtil && !referenciaLote) {
      banco.motivo =
        'Sin Envio_Id válido ni referencia registrada; se reporta solo el estado local.';
      return banco;
    }

    const consultaPor: NonNullable<EstadoBanco['consultaPor']> = envioIdUtil
      ? 'envioId'
      : 'referencia';
    const tramas: TramaSoap[] = [];
    try {
      const orden = await this.soapProdubanco.consultaOrdenes(
        {
          strIdEmpresa: idEmpresa,
          strIdServicio: idServicio,
          idBuzon: envioIdUtil ?? '0',
          // Sin Envio_Id válido se filtra por la Referencia del lote
          // (nuestra referenciaLote) para poder hallar la orden §2.2.1.
          ...(envioIdUtil ? {} : { referencia: referenciaLote ?? undefined }),
        },
        tramas,
      );
      const sobre: SobreBanco | null = orden.sinDatos
        ? null
        : ((orden.registros[0] as SobreBanco | undefined) ?? null);

      // Al consultar por referencia (idBuzon=0) el banco podría devolver una
      // orden distinta: sólo se sincroniza si la Referencia coincide.
      if (!envioIdUtil && sobre && referenciaLote) {
        const referenciaBanco = aTexto(sobre.Referencia).trim();
        if (referenciaBanco !== referenciaLote) {
          this.logger.warn(
            `Consulta por referencia devolvió otra orden idTransaccion=${tx.idTransaccion}: esperada=${referenciaLote} recibida=${referenciaBanco}; no se sincroniza.`,
          );
          return {
            consultado: true,
            sinDatos: false,
            codigo: orden.codigo ?? null,
            mensaje: orden.mensaje ?? null,
            consultaPor,
            motivo:
              'La referencia devuelta por el banco no coincide con la del lote; no se sincroniza.',
            orden: null,
            movimientos: [],
            tramas,
          };
        }
      }

      let movimientos: MovimientoBanco[] = [];
      if (sobre?.Id_Sobre) {
        const mov = await this.soapProdubanco.consultaMovimientos(
          {
            strIdEmpresa: idEmpresa,
            strIdServicio: idServicio,
            IdSobre: String(sobre.Id_Sobre),
          },
          tramas,
        );
        movimientos = mov.registros as MovimientoBanco[];
      }
      await this.sincronizarEstadoBanco(tx, sobre, movimientos, orden);
      banco = {
        consultado: true,
        sinDatos: orden.sinDatos,
        codigo: orden.codigo ?? null,
        mensaje: orden.mensaje ?? null,
        consultaPor,
        orden: sobre,
        movimientos,
        tramas,
      };
    } catch (error: unknown) {
      const info = infoError(error);
      banco = {
        consultado: false,
        error: info.message,
        consultaPor,
        tramas,
      };
      this.logger.warn(
        `Consulta de estado en banco falló idTransaccion=${tx.idTransaccion}: ${info.message}`,
      );
    }
    return banco;
  }

  private textoEstado(status: number): string {
    return textoEstado(status);
  }

  /** Desencripta con la llave de la app; null si no es descifrable o no hay key. */
  private desencriptarSeguro(
    valor: string | null | undefined,
    secretKey: string | null,
  ): string | null {
    if (!valor || !secretKey) return null;
    try {
      return this.universalCryptoService.decrypt(valor, secretKey);
    } catch {
      return null;
    }
  }

  /** Estado verbatim; si la columna es null (lotes antiguos) cae a
   * responsePayload.estadoBanco persistido en la consulta previa. */
  private estadoTransaccionOFallback(
    tx: { estadoServicio: string | null },
    response: Record<string, unknown>,
  ): string | null {
    if (tx.estadoServicio) return tx.estadoServicio;
    return typeof response['estadoBanco'] === 'string'
      ? response['estadoBanco']
      : null;
  }

  /** Extrae del responsePayload lo respondido por el SOAP en la última
   * consulta: código (0005 sin datos), mensaje y fecha de consulta. */
  private camposBancoResponse(response: Record<string, unknown>) {
    const texto = (k: string): string | null =>
      typeof response[k] === 'string' ? response[k] : null;
    return {
      codigoBanco: texto('codigoBanco'),
      mensajeBanco: texto('mensajeBanco'),
      fechaConsultaBanco: texto('fechaConsultaBanco'),
    };
  }

  private formatearListado(tx: TxListado, secretKey: string | null) {
    const response = comoObjeto(tx.responsePayload);
    const envioId =
      typeof response['envioId'] === 'string' ? response['envioId'] : null;
    // Conteo de estados de detalle verbatim de Produbanco (estado_item)
    const estadosDetalle: Record<string, number> = {};
    for (const d of tx.detalles) {
      estadosDetalle[d.estadoItem] = (estadosDetalle[d.estadoItem] ?? 0) + 1;
    }
    // Primer detalle del lote (ya ordenado por secuencia): resume la
    // identificación y cuenta del beneficiario para el listado.
    const primero = tx.detalles[0];
    return {
      idTransaccion: tx.idTransaccion.toString(),
      referenciaLote: this.desencriptarSeguro(tx.reference, secretKey),
      operacion: tx.operation,
      status: tx.status,
      statusServicio: textoEstado(tx.status),
      estadoTransaccion: this.estadoTransaccionOFallback(tx, response),
      ...this.camposBancoResponse(response),
      envioId,
      errorMessage: tx.errorMessage,
      fechaCreacion: tx.createdAt,
      beneficiarioIdentificacion: primero
        ? this.desencriptarSeguro(primero.beneficiarioIdentificacion, secretKey)
        : null,
      beneficiarioCuenta: primero
        ? this.desencriptarSeguro(primero.beneficiarioCuenta, secretKey)
        : null,
      registros: tx.detalles.length,
      montoTotal: tx.detalles.reduce((acc, d) => acc + Number(d.monto), 0),
      estadosDetalle,
    };
  }

  private formatearDetalleTransaccion(
    tx: TxConDetalles,
    secretKey: string,
  ) {
    const response = comoObjeto(tx.responsePayload);
    const envioId =
      typeof response['envioId'] === 'string' ? response['envioId'] : null;
    return {
      idTransaccion: tx.idTransaccion.toString(),
      referenciaLote: this.desencriptarSeguro(tx.reference, secretKey),
      operacion: tx.operation,
      status: tx.status,
      statusServicio: textoEstado(tx.status),
      estadoTransaccion: this.estadoTransaccionOFallback(tx, response),
      ...this.camposBancoResponse(response),
      // XML crudo de CargaDirectaXml (diagnóstico, ej. Envio_Id=0 no
      // documentado); solo en el detalle, no en el listado.
      cargaRespuestaBanco:
        typeof response['cargaRespuestaBanco'] === 'string'
          ? response['cargaRespuestaBanco']
          : null,
      envioId,
      errorMessage: tx.errorMessage,
      fechaCreacion: tx.createdAt,
      totales: {
        registros: tx.detalles.length,
        montoTotal: tx.detalles.reduce((acc, d) => acc + Number(d.monto), 0),
      },
      detalles: tx.detalles.map((d) => ({
        secuencia: d.secuencia,
        tipoId: d.beneficiarioTipoId,
        identificacion: this.desencriptarSeguro(
          d.beneficiarioIdentificacion,
          secretKey,
        ),
        nombre: d.beneficiarioNombre,
        cuenta: this.desencriptarSeguro(d.beneficiarioCuenta, secretKey),
        bancoCodigo: d.beneficiarioBancoCodigo,
        formaPago: d.formaPago,
        monto: Number(d.monto),
        moneda: d.moneda,
        referenciaDocumento: d.referenciaDocumento,
        estadoItem: d.estadoItem,
        codigoRespuesta: d.codigoRespuesta,
        mensajeBanco: d.mensajeRespuesta,
      })),
    };
  }

  /**
   * Sincroniza la BD local con la respuesta de Produbanco:
   * - Sin sobre (p. ej. CodRetorno 0005): se persiste lo que manda el SOAP
   *   (estadoServicio = código, codigoBanco/mensajeBanco); NO toca status.
   * - Con sobre: `estadoServicio` = Estado_Sobre verbatim; status interno
   *   REVOCADO->ERROR, APROBADO/PROCESADO->PROCESADO_BANCO, ACTIVO conserva.
   * - responsePayload guarda estadoBanco/codigoBanco/mensajeBanco/idSobre/
   *   fecha y preserva cargaRespuestaBanco (XML crudo de la carga).
   * - Detalles por posición hasta min(movimientos, detalles): estadoItem =
   *   Estado_Proceso verbatim (Manual §2.3.1) + catálogo/mensaje tal cual.
   */
  private async sincronizarEstadoBanco(
    tx: TxConDetalles,
    sobre: SobreBanco | null,
    movimientos: MovimientoBanco[],
    consulta: { sinDatos: boolean; codigo?: string; mensaje?: string },
  ): Promise<void> {
    const previo = comoObjeto(tx.responsePayload);
    const prevStr = (k: string): string | null => {
      const v = previo[k];
      return typeof v === 'string' ? v : null;
    };
    const prevNum = (k: string): number | null => {
      const v = previo[k];
      return typeof v === 'number' ? v : null;
    };
    const codigoBanco = consulta.codigo?.trim() || null;
    const mensajeBanco = consulta.mensaje?.trim() || null;

    if (!sobre) {
      // Sin sobre: se conserva y muestra lo que mandó Produbanco
      // (CodRetorno/MsjRetorno, p. ej. 0005 = sin datos, no es error).
      const estadoServicio = codigoBanco ?? tx.estadoServicio ?? null;
      const responsePayload = {
        envioId: prevStr('envioId'),
        mensaje: prevStr('mensaje'),
        cargaRespuestaBanco: prevStr('cargaRespuestaBanco'),
        error: prevStr('error'),
        estadoBanco: prevStr('estadoBanco'),
        codigoBanco,
        mensajeBanco,
        idSobre: prevStr('idSobre'),
        numeroItems: prevNum('numeroItems'),
        valorSobre: prevStr('valorSobre'),
        fechaConsultaBanco: new Date().toISOString(),
      };
      tx.estadoServicio = estadoServicio;
      tx.responsePayload = responsePayload;
      await this.prisma.transaccionesServicios.update({
        where: { idTransaccion: tx.idTransaccion },
        data: { estadoServicio, responsePayload },
      });
      return;
    }

    const estadoSobre = String(sobre.Estado_Sobre ?? '')
      .trim()
      .toUpperCase();
    const revocado = estadoSobre.includes('REVOCADO');
    const aprobadoONo =
      estadoSobre === 'APROBADO' || estadoSobre === 'PROCESADO';

    const idSobre =
      sobre.Id_Sobre !== undefined && sobre.Id_Sobre !== null
        ? String(sobre.Id_Sobre)
        : prevStr('idSobre');
    const numeroItems =
      typeof sobre.Numero_Items === 'number'
        ? sobre.Numero_Items
        : prevNum('numeroItems');
    const valorSobre =
      sobre.Valor_Sobre !== undefined && sobre.Valor_Sobre !== null
        ? String(sobre.Valor_Sobre)
        : prevStr('valorSobre');
    const mensajeRevocado = revocado
      ? `Produbanco revocó la orden (Estado_Sobre=REVOCADO, Ref=${String(sobre.Referencia ?? 'N/A')})`
      : null;

    const responsePayload = {
      envioId: prevStr('envioId'),
      mensaje: prevStr('mensaje'),
      cargaRespuestaBanco: prevStr('cargaRespuestaBanco'),
      error: mensajeRevocado,
      estadoBanco: estadoSobre || prevStr('estadoBanco'),
      codigoBanco,
      mensajeBanco,
      idSobre,
      numeroItems,
      valorSobre,
      fechaConsultaBanco: new Date().toISOString(),
    };

    // Estado verbatim de Produbanco en la cabecera (vacío -> conserva previo)
    const estadoServicio = estadoSobre || tx.estadoServicio || null;

    // Resumen interno: la fuente verbatim vive en `estadoServicio`.
    if (revocado) {
      tx.status = EstadoTransaccion.ERROR;
    } else if (aprobadoONo) {
      tx.status = EstadoTransaccion.PROCESADO_BANCO;
    }
    tx.errorMessage = mensajeRevocado;
    tx.responsePayload = responsePayload;
    tx.estadoServicio = estadoServicio;

    await this.prisma.transaccionesServicios.update({
      where: { idTransaccion: tx.idTransaccion },
      data: {
        status: tx.status,
        estadoServicio,
        errorMessage: tx.errorMessage,
        responsePayload,
      },
    });

    // Sincroniza por posición hasta donde alcance la respuesta del banco
    const sincronizables = Math.min(movimientos.length, tx.detalles.length);
    if (sincronizables === 0) {
      return;
    }

    await Promise.all(
      tx.detalles.slice(0, sincronizables).map(async (detalle, idx) => {
        const mov = movimientos[idx];
        const estadoProceso = String(mov?.Estado_Proceso ?? '')
          .trim()
          .toUpperCase();
        const mensaje = String(mov?.Mensaje ?? '').trim();
        if (!estadoProceso && !mensaje) return;

        // Estado_Proceso verbatim de Produbanco (Manual §2.3.1);
        // si viene vacío conserva el estado previo del detalle.
        const estadoItem = estadoProceso
          ? estadoProceso.substring(0, 20)
          : detalle.estadoItem;
        const codigoRespuesta = estadoProceso
          ? estadoProceso.substring(0, 20)
          : detalle.codigoRespuesta;
        const mensajeRespuesta = mensaje || detalle.mensajeRespuesta;

        if (
          estadoItem === detalle.estadoItem &&
          codigoRespuesta === detalle.codigoRespuesta &&
          mensajeRespuesta === detalle.mensajeRespuesta
        ) {
          return;
        }
        detalle.estadoItem = estadoItem;
        detalle.codigoRespuesta = codigoRespuesta;
        detalle.mensajeRespuesta = mensajeRespuesta;
        await this.prisma.transaccionesBancariasDetalle.update({
          where: { id_detalle: detalle.id_detalle },
          data: { estadoItem, codigoRespuesta, mensajeRespuesta },
        });
      }),
    );
  }
}
