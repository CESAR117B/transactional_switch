import { Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service'; // Ajusta la ruta a tu PrismaService
import { ProdubancoSoapService } from '../Integraciones/ProdubancoSoap.service';
import {
  CrearPagoLoteDto,
  PagoDetalleItemDto,
} from '../dto/crear-pago-lote.dto';
import {
  CrearTransferenciaLoteDto,
  TransferenciaDetalleItemDto,
} from '../dto/crear-transferencia-lote.dto';
import { UniversalCryptoService } from './universal-crypto.service';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';

// Estados transaccionales internos
export enum EstadoTransaccion {
  PENDIENTE = 1,
  PROCESADO_BANCO = 2,
  ERROR = 3,
}

type TxConDetalles = Prisma.TransaccionesServiciosGetPayload<{
  include: { detalles: true };
}>;

type TxListado = Prisma.TransaccionesServiciosGetPayload<{
  include: { detalles: { select: { monto: true; estadoItem: true } } };
}>;

/** Registro de Consulta_Sobres_VIEW (Manual §2.2.1). */
interface SobreBanco {
  Id_Sobre?: number | string;
  Estado_Sobre?: string;
  Referencia?: string;
  Numero_Items?: number | string;
  Valor_Sobre?: number | string;
}

/** Registro de Movimientos_Out (Manual §2.3.1). */
interface MovimientoBanco {
  Estado_Proceso?: string;
  Mensaje?: string;
}

/** Bloque de estado bancario incluido en la respuesta de consulta. */
export interface EstadoBanco {
  consultado: boolean;
  sinDatos?: boolean;
  /** Cómo se buscó la orden: por Envio_Id o, si el Envio_Id no sirve
   * (p. ej. 0), por la Referencia registrada en la carga (Manual §2.2.1). */
  consultaPor?: 'envioId' | 'referencia';
  /** CodRetorno del SOAP (ej. 0005 = sin datos). */
  codigo?: string | null;
  /** MsjRetorno verbatim del banco. */
  mensaje?: string | null;
  motivo?: string;
  error?: string;
  orden?: SobreBanco | null;
  movimientos?: MovimientoBanco[];
}

@Injectable()
export class TramasProdubancoService {
  private readonly logger = new Logger(TramasProdubancoService.name);

  /** Únicas operaciones de Produbanco: todo listado/consulta se limita a estas. */
  private static readonly OPERACIONES_PRODUBANCO: string[] = [
    'SPR_PRODUBANCO-PAGO',
    'SPR_PRODUBANCO-TRANSFERENCIA_EXTERIOR',
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly soapProdubanco: ProdubancoSoapService,
    private readonly universalCryptoService: UniversalCryptoService,
  ) {}

  /**
   * Procesa y persiste un lote de pagos locales en Produbanco.
   */
  async generarPago(idApp: number, data: CrearPagoLoteDto) {
    data.referenciaLote = await this.generarReferenciaLote(idApp);
    this.validarLotePago(data);

    // 1. Guardar en BD en estado PENDIENTE con sus detalles[cite: 4]
    const transaccion = await this.guardarTransaccionPagoBD(idApp, data);

    try {
      // 2. Generar XML y consumir WebService Produbanco
      const xmlPlano = this.construirXmlPago(data);
      const tramaEncriptada =
        await this.soapProdubanco.autenticarYEncriptar(xmlPlano);
      const { envioId, estado, respuesta } =
        await this.soapProdubanco.cargarDirectaXml(tramaEncriptada);

      // 3. Actualizar BD con el Envio_Id y respuesta exitosa del banco[cite: 4]
      await this.actualizarTransaccionExitoBD(
        transaccion.idTransaccion,
        envioId,
        estado,
        respuesta,
      );

      return {
        exito: true,
        idTransaccion: transaccion.idTransaccion.toString(),
        referenciaLote: data.referenciaLote,
        envioId,
        totalRegistros: data.detalles.length,
        montoTotal: data.detalles.reduce((acc, item) => acc + item.monto, 0),
      };
    } catch (error: unknown) {
      // 4. Registrar fallo en BD en caso de error en la red o servidor bancario[cite: 4]
      const info = this.infoErrorConBanco(error);
      await this.actualizarTransaccionErrorBD(
        transaccion.idTransaccion,
        info.message,
        info.respuestaBanco,
      );
      throw error;
    }
  }

  /**
   * Procesa y persiste un lote de transferencias internacionales (Transfer Full).
   */
  async generarTransferencia(idApp: number, data: CrearTransferenciaLoteDto) {
    data.referenciaLote = await this.generarReferenciaLote(idApp);
    this.validarLoteTransferencia(data);

    // 1. Guardar en BD en estado PENDIENTE[cite: 4]
    const transaccion = await this.guardarTransaccionTransferenciaBD(
      idApp,
      data,
    );

    try {
      // 2. Generar XML con campos de exterior y consumir WebService
      const xmlPlano = this.construirXmlTransferencia(data);
      const tramaEncriptada =
        await this.soapProdubanco.autenticarYEncriptar(xmlPlano);
      const { envioId, estado, respuesta } =
        await this.soapProdubanco.cargarDirectaXml(tramaEncriptada);

      // 3. Actualizar BD con confirmación del banco[cite: 4]
      await this.actualizarTransaccionExitoBD(
        transaccion.idTransaccion,
        envioId,
        estado,
        respuesta,
      );

      return {
        exito: true,
        idTransaccion: transaccion.idTransaccion.toString(),
        referenciaLote: data.referenciaLote,
        envioId,
        totalRegistros: data.detalles.length,
        montoTotal: data.detalles.reduce((acc, item) => acc + item.monto, 0),
      };
    } catch (error: unknown) {
      const info = this.infoErrorConBanco(error);
      await this.actualizarTransaccionErrorBD(
        transaccion.idTransaccion,
        info.message,
        info.respuestaBanco,
      );
      throw error;
    }
  }

  // ==========================================
  // CONSULTA DE ESTADO PARA APPS REGISTRADAS
  // ==========================================

  /**
   * Lista las transacciones de una app (paginado), con estado local y totales.
   * La referencia se desencripta con la llave de la app antes de responder.
   */
  async consultarTransacciones(
    idApp: number,
    params: {
      page?: number;
      pageSize?: number;
      status?: number;
      operation?: string;
    },
  ) {
    const page = Math.max(1, Math.trunc(Number(params.page) || 1));
    const pageSize = Math.min(
      50,
      Math.max(1, Math.trunc(Number(params.pageSize) || 20)),
    );
    const where: Prisma.TransaccionesServiciosWhereInput = {
      idApp,
      operation: { in: TramasProdubancoService.OPERACIONES_PRODUBANCO },
    };
    if (
      params.status !== undefined &&
      params.status !== null &&
      [1, 2, 3].includes(Number(params.status))
    ) {
      where.status = Number(params.status);
    }
    const operation = this.operacionValida(params.operation);
    if (operation) {
      where.operation = operation;
    }

    const [total, items] = await Promise.all([
      this.prisma.transaccionesServicios.count({ where }),
      this.prisma.transaccionesServicios.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          detalles: { select: { monto: true, estadoItem: true } },
        },
      }),
    ]);

    const secretKey = await this.getEncryptionKey(idApp);
    return {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: items.map((tx) => this.formatearListado(tx, secretKey)),
    };
  }

  /**
   * Detalle de estado de una transacción: estado local (BD) + consulta en vivo
   * a Produbanco (ConsultaOrdenes por Envio_Id y, opcionalmente,
   * ConsultaMovimientos por Id_Sobre), sincronizando la BD con la respuesta.
   * Si el Envio_Id no sirve (vacío/"0"/no numérico, p. ej. cuando la carga
   * responde Envio_Id=0) se consulta por la Referencia del lote (§2.2.1);
   * `banco.consultaPor` indica el modo usado. Un fallo del banco NO rompe la
   * respuesta: se reporta en `banco.error`.
   */
  async consultarEstadoTransaccion(
    idApp: number,
    params: {
      dato?: string | number;
    },
  ) {
    const secretKey = await this.getEncryptionKey(idApp);
    // El filtro de operaciones (por defecto solo Produbanco) se aplica
    // dentro de resolverTransaccion, a nivel de consulta.
    const tx = await this.resolverTransaccion(idApp, params);

    let banco: EstadoBanco = { consultado: false };
    const response = this.comoObjeto(tx.responsePayload);
    const envioId =
      typeof response['envioId'] === 'string' ? response['envioId'] : null;
    // Envio_Id usable como idBuzon: numérico y distinto de "0". Produbanco
    // puede responder Envio_Id=0 en la carga (caso no documentado); en ese
    // caso la consulta se hace por Referencia registrada en la carga.
    const envioIdUtil =
      envioId && /^\d+$/.test(envioId) && envioId !== '0' ? envioId : null;
    const referenciaLote = this.desencriptarSeguro(tx.reference, secretKey);
    const req = this.comoObjeto(tx.requestPayload);
    const idEmpresa = this.aTexto(req['idEmpresa']);
    const idServicio = this.aTexto(req['idServicio']);

    if (!idEmpresa || !idServicio) {
      banco.motivo =
        'requestPayload sin idEmpresa/idServicio (lote antiguo); se reporta solo el estado local.';
    } else {
      const consultaPor: NonNullable<EstadoBanco['consultaPor']> = envioIdUtil
        ? 'envioId'
        : 'referencia';
      try {
        const orden = await this.soapProdubanco.consultaOrdenes({
          strIdEmpresa: idEmpresa,
          strIdServicio: idServicio,
          idBuzon: envioIdUtil ?? '0',
          // Sin Envio_Id válido se filtra por la Referencia del lote
          // (nuestra referenciaLote) para poder hallar la orden §2.2.1.
          ...(envioIdUtil ? {} : { referencia: referenciaLote ?? undefined }),
        });
        const sobre = orden.sinDatos
          ? null
          : ((orden.registros[0] as SobreBanco | undefined) ?? null);
        let movimientos: MovimientoBanco[] = [];
        if (sobre?.Id_Sobre) {
          const mov = await this.soapProdubanco.consultaMovimientos({
            strIdEmpresa: idEmpresa,
            strIdServicio: idServicio,
            IdSobre: String(sobre.Id_Sobre),
          });
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
        };
      } catch (error: unknown) {
        const info = this.infoError(error);
        banco = {
          consultado: false,
          error: info.message,
          consultaPor,
        };
        this.logger.warn(
          `Consulta de estado en banco falló idTransaccion=${tx.idTransaccion}: ${info.message}`,
        );
      }
    }

    return { ...this.formatearDetalleTransaccion(tx, secretKey), banco };
  }

  // ==========================================
  // MÉTODOS DE PERSISTENCIA EN BD (PRISMA)
  // ==========================================

  // Helpers de cifrado - server cifra, client descifra con la misma encryptionKey (32 chars)
  private async getEncryptionKey(idApp: number): Promise<string> {
    const appRecord = await this.prisma.app.findUnique({
      where: { id_app: idApp },
      select: { encryptionKey: true },
    });
    if (!appRecord || !appRecord.encryptionKey) {
      throw new RpcException({
        statusCode: 500,
        message: `La app con ID ${idApp} no tiene llave de encriptación configurada. Genere una con add_app_encryption_key. El client desencripta con la misma llave.`,
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

  private sha256(value: string): string {
    return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
  }

  /** Normaliza info_app.nombre a código [A-Z0-9] (máx 15); vacío -> null. */
  private normalizarNombreApp(nombre?: string | null): string | null {
    if (!nombre) return null;
    const limpio = nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 15);
    return limpio || null;
  }

  /**
   * Referencia del lote generada por el back (los DTO ya no la reciben):
   * NOMBREAPP-{secuencia}-{yyyyMMddHHmmss}-{4 hex}
   * - nombre = info_app.nombre (fallback APP{idApp})
   * - secuencia = COUNT(transacciones de la app) + 1, 5 dígitos
   * - timestamp + 4 hex garantizan unicidad (referenceHash es UNIQUE)
   */
  private async generarReferenciaLote(idApp: number): Promise<string> {
    const info = await this.prisma.info_app.findUnique({
      where: { id_app: idApp },
      select: { nombre: true },
    });
    const nombre = this.normalizarNombreApp(info?.nombre) ?? `APP${idApp}`;
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

  /** sha256 del contenido del lote SIN referenciaLote — llave de idempotencia
   * (la referencia ya no la envía el cliente, así que el dedup va por datos). */
  private hashContenidoLote(
    data: CrearPagoLoteDto | CrearTransferenciaLoteDto,
  ): string {
    const contenido = JSON.stringify(data, (key: string, value: unknown) =>
      key === 'referenciaLote' ? undefined : value,
    );
    return this.sha256(contenido);
  }

  /**
   * Crea el registro de Cabecera y Detalle para Pagos Locales[cite: 4].
   * Cifra en BD: cuentaEmpresa, identificacion, cuenta, reference (via referenceEncrypted + referenceHash unique). Client desencripta con encryptionKey.
   */
  private async guardarTransaccionPagoBD(
    idApp: number,
    data: CrearPagoLoteDto,
  ) {
    const secretKey = await this.getEncryptionKey(idApp);
    const referenceEncrypted = this.universalCryptoService.encrypt(
      data.referenciaLote ?? '',
      secretKey,
    );
    const referenceHash = this.sha256(data.referenciaLote ?? '');
    const requestHash = this.hashContenidoLote(data);

    // Payload cifrado: cuentaEmpresa + identificacion + cuenta dentro de detalles
    const payloadCifrado = {
      ...JSON.parse(JSON.stringify(data)),
      cuentaEmpresa: this.universalCryptoService.encrypt(
        data.cuentaEmpresa,
        secretKey,
      ),
      referenciaLote: referenceEncrypted, // tambien cifrado en payload para no exponer referencia
      detalles: data.detalles.map((d) => ({
        ...JSON.parse(JSON.stringify(d)),
        identificacion: this.universalCryptoService.encrypt(
          d.identificacion,
          secretKey,
        ),
        cuenta: d.cuenta
          ? this.universalCryptoService.encrypt(d.cuenta, secretKey)
          : d.cuenta,
      })),
    };

    // Idempotencia: la referencia la genera el back, así que el dedup va por
    // el hash del CONTENIDO del lote (requestHash) de esta misma app.
    const existing = await this.prisma.transaccionesServicios.findFirst({
      where: { idApp, requestHash },
      select: { idTransaccion: true, status: true, idApp: true },
    });
    if (existing) {
      if (existing.status === EstadoTransaccion.ERROR) {
        this.logger.warn(
          `Reintentando lote con contenido duplicado ${data.referenciaLote} (requestHash=${requestHash}) idTransaccion=${existing.idTransaccion} status=ERROR -> reciclando`,
        );
        // Borra detalles previos y recrea con payload actualizado, resetea a PENDIENTE
        await this.prisma.transaccionesBancariasDetalle.deleteMany({
          where: { idTransaccion: existing.idTransaccion },
        });
        return this.prisma.transaccionesServicios.update({
          where: { idTransaccion: existing.idTransaccion },
          data: {
            idApp,
            reference: referenceEncrypted,
            referenceHash,
            requestPayload: payloadCifrado,
            responsePayload: {},
            status: EstadoTransaccion.PENDIENTE,
            errorMessage: null,
            detalles: {
              create: data.detalles.map(
                (item: PagoDetalleItemDto, indice: number) => ({
                  secuencia: indice + 1,
                  beneficiarioTipoId: item.tipoId,
                  beneficiarioIdentificacion:
                    this.universalCryptoService.encrypt(
                      item.identificacion,
                      secretKey,
                    ),
                  beneficiarioNombre: item.nombre,
                  beneficiarioCuenta: item.cuenta
                    ? this.universalCryptoService.encrypt(
                        item.cuenta,
                        secretKey,
                      )
                    : null,
                  beneficiarioBancoCodigo:
                    item.formaPago === 'CTA'
                      ? '0036'
                      : item.bancoCodigo || null,
                  monto: item.monto,
                  moneda: 'USD',
                  formaPago: item.formaPago,
                  referenciaDocumento: item.referencia || null,
                  estadoItem: 'PENDIENTE',
                }),
              ),
            },
          },
        });
      }
      // PENDIENTE o PROCESADO_BANCO -> conflicto, cliente debe usar nueva referenciaLote
      throw new RpcException({
        statusCode: 409,
        message: `Lote con contenido idéntico ya existe (referencia=${data.referenciaLote}, estado=${existing.status === EstadoTransaccion.PENDIENTE ? 'PENDIENTE' : existing.status === EstadoTransaccion.PROCESADO_BANCO ? 'PROCESADO_BANCO' : existing.status}).`,
        error: 'Conflict',
      });
    }

    return this.prisma.transaccionesServicios.create({
      data: {
        servicio: 'PRODUBANCO',
        idApp: idApp,
        operation: 'SPR_PRODUBANCO-PAGO',
        reference: referenceEncrypted,
        referenceHash,
        requestHash,
        requestPayload: payloadCifrado,
        responsePayload: {},
        status: EstadoTransaccion.PENDIENTE,
        detalles: {
          create: data.detalles.map(
            (item: PagoDetalleItemDto, indice: number) => ({
              secuencia: indice + 1,
              beneficiarioTipoId: item.tipoId,
              beneficiarioIdentificacion: this.universalCryptoService.encrypt(
                item.identificacion,
                secretKey,
              ),
              beneficiarioNombre: item.nombre,
              beneficiarioCuenta: item.cuenta
                ? this.universalCryptoService.encrypt(item.cuenta, secretKey)
                : null,
              beneficiarioBancoCodigo:
                item.formaPago === 'CTA' ? '0036' : item.bancoCodigo || null,
              monto: item.monto,
              moneda: 'USD',
              formaPago: item.formaPago,
              referenciaDocumento: item.referencia || null,
              estadoItem: 'PENDIENTE',
            }),
          ),
        },
      },
    });
  }

  /**
   * Crea el registro de Cabecera y Detalle para Transferencias al Exterior[cite: 4].
   * Cifra en BD: cuentaEmpresa, identificacion (beneficiarioCuenta), cuenta (beneficiarioCuenta), reference.
   */
  private async guardarTransaccionTransferenciaBD(
    idApp: number,
    data: CrearTransferenciaLoteDto,
  ) {
    const secretKey = await this.getEncryptionKey(idApp);
    const referenceEncrypted = this.universalCryptoService.encrypt(
      data.referenciaLote ?? '',
      secretKey,
    );
    const referenceHash = this.sha256(data.referenciaLote ?? '');
    const requestHash = this.hashContenidoLote(data);

    const payloadCifrado = {
      ...JSON.parse(JSON.stringify(data)),
      cuentaEmpresa: this.universalCryptoService.encrypt(
        data.cuentaEmpresa,
        secretKey,
      ),
      referenciaLote: referenceEncrypted,
      detalles: data.detalles.map((d) => ({
        ...JSON.parse(JSON.stringify(d)),
        beneficiarioCuenta: this.universalCryptoService.encrypt(
          d.beneficiarioCuenta,
          secretKey,
        ),
        codigoSwiftAba: d.codigoSwiftAba
          ? this.universalCryptoService.encrypt(d.codigoSwiftAba, secretKey)
          : d.codigoSwiftAba,
      })),
    };

    // Idempotencia: la referencia la genera el back, así que el dedup va por
    // el hash del CONTENIDO del lote (requestHash) de esta misma app.
    const existing = await this.prisma.transaccionesServicios.findFirst({
      where: { idApp, requestHash },
      select: { idTransaccion: true, status: true },
    });
    if (existing) {
      if (existing.status === EstadoTransaccion.ERROR) {
        this.logger.warn(
          `Reintentando transferencia con contenido duplicado ${data.referenciaLote} (requestHash=${requestHash}) idTransaccion=${existing.idTransaccion} status=ERROR -> reciclando`,
        );
        await this.prisma.transaccionesBancariasDetalle.deleteMany({
          where: { idTransaccion: existing.idTransaccion },
        });
        return this.prisma.transaccionesServicios.update({
          where: { idTransaccion: existing.idTransaccion },
          data: {
            idApp,
            reference: referenceEncrypted,
            referenceHash,
            requestPayload: payloadCifrado,
            responsePayload: {},
            status: EstadoTransaccion.PENDIENTE,
            errorMessage: null,
            detalles: {
              create: data.detalles.map(
                (item: TransferenciaDetalleItemDto, indice: number) => ({
                  secuencia: indice + 1,
                  beneficiarioTipoId: item.tipoId,
                  beneficiarioIdentificacion:
                    this.universalCryptoService.encrypt(
                      item.identificacion,
                      secretKey,
                    ),
                  beneficiarioNombre: item.beneficiarioNombre,
                  beneficiarioCuenta: this.universalCryptoService.encrypt(
                    item.beneficiarioCuenta,
                    secretKey,
                  ),
                  beneficiarioBancoCodigo: item.codigoSwiftAba
                    ? item.codigoSwiftAba.substring(0, 10)
                    : null,
                  monto: item.monto,
                  moneda: item.moneda || 'USD',
                  formaPago: 'SPI',
                  referenciaDocumento: item.referencia || null,
                  codigoSwiftAba: item.codigoSwiftAba
                    ? this.universalCryptoService.encrypt(
                        item.codigoSwiftAba,
                        secretKey,
                      )
                    : item.codigoSwiftAba,
                  conceptoInvisibles: item.conceptoInvisibles,
                  codigoExoneracionIsd: item.codigoExoneracionIsd || '0',
                  estadoItem: 'PENDIENTE',
                }),
              ),
            },
          },
        });
      }
      throw new RpcException({
        statusCode: 409,
        message: `Transferencia con contenido idéntico ya existe (referencia=${data.referenciaLote}, estado=${existing.status === EstadoTransaccion.PENDIENTE ? 'PENDIENTE' : existing.status === EstadoTransaccion.PROCESADO_BANCO ? 'PROCESADO_BANCO' : existing.status}).`,
        error: 'Conflict',
      });
    }

    return this.prisma.transaccionesServicios.create({
      data: {
        servicio: 'PRODUBANCO',
        idApp: idApp,
        operation: 'SPR_PRODUBANCO-TRANSFERENCIA_EXTERIOR',
        reference: referenceEncrypted,
        referenceHash,
        requestHash,
        requestPayload: payloadCifrado,
        responsePayload: {},
        status: EstadoTransaccion.PENDIENTE,
        detalles: {
          create: data.detalles.map(
            (item: TransferenciaDetalleItemDto, indice: number) => ({
              secuencia: indice + 1,
              beneficiarioTipoId: item.tipoId,
              beneficiarioIdentificacion: this.universalCryptoService.encrypt(
                item.identificacion,
                secretKey,
              ),
              beneficiarioNombre: item.beneficiarioNombre,
              beneficiarioCuenta: this.universalCryptoService.encrypt(
                item.beneficiarioCuenta,
                secretKey,
              ),
              beneficiarioBancoCodigo: item.codigoSwiftAba
                ? item.codigoSwiftAba.substring(0, 10)
                : null,
              monto: item.monto,
              moneda: item.moneda || 'USD',
              formaPago: 'SPI',
              referenciaDocumento: item.referencia || null,
              codigoSwiftAba: item.codigoSwiftAba
                ? this.universalCryptoService.encrypt(
                    item.codigoSwiftAba,
                    secretKey,
                  )
                : item.codigoSwiftAba,
              conceptoInvisibles: item.conceptoInvisibles,
              codigoExoneracionIsd: item.codigoExoneracionIsd || '0',
              estadoItem: 'PENDIENTE',
            }),
          ),
        },
      },
    });
  }

  /**
   * Actualiza la transacción a éxito cuando Produbanco retorna el Envio_Id[cite: 4].
   * `estadoServicio` guarda el <Estado> verbatim de la respuesta (VALIDADO) y
   * `cargaRespuestaBanco` conserva el XML crudo (diagnóstico, máx 4000 chars).
   */
  private async actualizarTransaccionExitoBD(
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
   * Marca la transacción con estado de error en caso de fallo de red/SOAP o
   * rechazo del banco (p. ej. "Trama inválida")[cite: 4]. `respuestaBanco`
   * conserva la respuesta cruda del SOAP para diagnóstico.
   */
  private async actualizarTransaccionErrorBD(
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
  // HELPERS DE CONSULTA DE ESTADO
  // ==========================================

  /** Normaliza un Json de Prisma a objeto accesible sin `any`. */
  private comoObjeto(json: unknown): Record<string, unknown> {
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      return json as Record<string, unknown>;
    }
    return {};
  }

  /** Extrae el message de un error desconocido sin usar `any`. */
  private infoError(error: unknown): { message: string } {
    const e = error as { message?: unknown } | undefined;
    return {
      message:
        typeof e?.message === 'string'
          ? e.message
          : 'Error consultando Produbanco',
    };
  }

  /**
   * Extrae message y la respuesta cruda adjunta (`respuestaBanco`, si el
   * servicio SOAP la adjuntó al rechazar la carga) sin usar `any`.
   */
  private infoErrorConBanco(error: unknown): {
    message: string;
    respuestaBanco: string | null;
  } {
    const e = error as
      { message?: unknown; respuestaBanco?: unknown } | undefined;
    return {
      message: typeof e?.message === 'string' ? e.message : 'Error desconocido',
      respuestaBanco:
        typeof e?.respuestaBanco === 'string' ? e.respuestaBanco : null,
    };
  }

  /** Convierte string|number desconocido a string ('' si no aplica). */
  private aTexto(valor: unknown): string {
    if (typeof valor === 'string') return valor;
    if (typeof valor === 'number') return String(valor);
    return '';
  }

  /**
   * Normaliza la operación a filtrar: válida (Produbanco) → el string tal
   * cual; ausente, no string o valor de otro servicio → null.
   */
  private operacionValida(operation?: string): string | null {
    if (typeof operation !== 'string') return null;
    const op = operation.trim();
    return TramasProdubancoService.OPERACIONES_PRODUBANCO.includes(op)
      ? op
      : null;
  }

  /**
   * Resuelve la transacción con un único campo `dato`: si es numérico se
   * intenta como idTransaccion y, si no existe, como referenciaLote (y
   * viceversa). Verifica que pertenezca a la app (404 en caso contrario,
   * sin filtrar existencia entre apps). Solo permite operaciones de
   * Produbanco (PAGO o TRANSFERENCIA_EXTERIOR): otras (ej. FIRSTOKEN) → 404.
   */
  private async resolverTransaccion(
    idApp: number,
    params: {
      dato?: string | number;
    },
  ): Promise<TxConDetalles> {
    const dato =
      params.dato !== undefined && params.dato !== null
        ? String(params.dato).trim()
        : '';
    if (!dato) {
      throw new RpcException({
        statusCode: 400,
        message: 'Se requiere el campo dato (idTransaccion o referenciaLote).',
      });
    }

    const include = { detalles: { orderBy: { secuencia: 'asc' as const } } };
    const esNumerico = /^\d+$/.test(dato);
    const filtroOperacion = {
      in: TramasProdubancoService.OPERACIONES_PRODUBANCO,
    };

    const buscarPorId = async () => {
      if (!esNumerico) return null;
      return this.prisma.transaccionesServicios.findFirst({
        where: {
          idTransaccion: BigInt(dato),
          operation: filtroOperacion,
        },
        include,
      });
    };
    const buscarPorReferencia = async () => {
      const hash = this.sha256(dato);
      return this.prisma.transaccionesServicios.findFirst({
        where: {
          referenceHash: hash,
          operation: filtroOperacion,
        },
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

    if (!tx || tx.idApp !== idApp) {
      throw new RpcException({
        statusCode: 404,
        message: 'Transacción no encontrada.',
      });
    }
    return tx;
  }

  private textoEstado(status: EstadoTransaccion): string {
    switch (status) {
      case EstadoTransaccion.PENDIENTE:
        return 'PENDIENTE';
      case EstadoTransaccion.PROCESADO_BANCO:
        return 'PROCESADO_BANCO';
      case EstadoTransaccion.ERROR:
        return 'ERROR';
      default:
        return 'DESCONOCIDO';
    }
  }

  /** Desencripta con la llave de la app; devuelve null si no es descifrable. */
  private desencriptarSeguro(
    valor: string | null | undefined,
    secretKey: string,
  ): string | null {
    if (!valor) return null;
    try {
      return this.universalCryptoService.decrypt(valor, secretKey);
    } catch {
      return null;
    }
  }

  /** Estado verbatim de Produbanco; si la columna es null (lotes antiguos)
   * cae a responsePayload.estadoBanco persistido en la consulta previa. */
  private estadoTransaccionOFallback(
    tx: { estadoServicio: string | null },
    response: Record<string, unknown>,
  ): string | null {
    if (tx.estadoServicio) return tx.estadoServicio;
    return typeof response['estadoBanco'] === 'string'
      ? response['estadoBanco']
      : null;
  }

  /** Extrae del responsePayload lo que respondió el SOAP en la última
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

  private formatearListado(tx: TxListado, secretKey: string) {
    const response = this.comoObjeto(tx.responsePayload);
    const envioId =
      typeof response['envioId'] === 'string' ? response['envioId'] : null;
    // Conteo de estados de detalle verbatim de Produbanco (estado_item)
    const estadosDetalle: Record<string, number> = {};
    for (const d of tx.detalles) {
      estadosDetalle[d.estadoItem] = (estadosDetalle[d.estadoItem] ?? 0) + 1;
    }
    return {
      idTransaccion: tx.idTransaccion.toString(),
      referenciaLote: this.desencriptarSeguro(tx.reference, secretKey),
      operacion: tx.operation,
      status: tx.status,
      statusServicio: this.textoEstado(tx.status),
      // Fallback a responsePayload.estadoBanco para lotes antiguos
      // creados antes de existir la columna estado_servicio.
      estadoTransaccion: this.estadoTransaccionOFallback(tx, response),
      ...this.camposBancoResponse(response),
      envioId,
      errorMessage: tx.errorMessage,
      fechaCreacion: tx.createdAt,
      registros: tx.detalles.length,
      montoTotal: tx.detalles.reduce((acc, d) => acc + Number(d.monto), 0),
      estadosDetalle,
    };
  }

  private formatearDetalleTransaccion(tx: TxConDetalles, secretKey: string) {
    const response = this.comoObjeto(tx.responsePayload);
    const envioId =
      typeof response['envioId'] === 'string' ? response['envioId'] : null;
    return {
      idTransaccion: tx.idTransaccion.toString(),
      referenciaLote: this.desencriptarSeguro(tx.reference, secretKey),
      operacion: tx.operation,
      status: tx.status,
      statusServicio: this.textoEstado(tx.status),
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
   * - Sin sobre (p. ej. CodRetorno 0005 = sin datos): se persiste igual lo
   *   que manda el SOAP (estadoServicio = código, codigoBanco/mensajeBanco)
   *   para saber qué está pasando; NO toca status ni errorMessage.
   * - Con sobre: `estadoServicio` = Estado_Sobre verbatim (vacío -> conserva
   *   previo); status interno solo como resumen: REVOCADO->ERROR,
   *   APROBADO/PROCESADO->PROCESADO_BANCO, ACTIVO conserva el actual.
   * - responsePayload guarda estadoBanco/codigoBanco/mensajeBanco/idSobre/fecha
   *   y preserva cargaRespuestaBanco (XML crudo de la carga).
   * - Detalles por posición hasta min(movimientos, detalles): estadoItem =
   *   Estado_Proceso verbatim (Manual §2.3.1) + catálogo/mensaje tal cual.
   */
  private async sincronizarEstadoBanco(
    tx: TxConDetalles,
    sobre: SobreBanco | null,
    movimientos: MovimientoBanco[],
    consulta: { sinDatos: boolean; codigo?: string; mensaje?: string },
  ): Promise<void> {
    const previo = this.comoObjeto(tx.responsePayload);
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
    // REVOCADO -> ERROR; APROBADO/PROCESADO -> PROCESADO_BANCO; ACTIVO u
    // otro valor conserva el actual (permanece PENDIENTE hasta aprobación).
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

  // ==========================================
  // HELPER MÉTODOS DE FORMATO DE TRAMA XML
  // ==========================================

  private escapeXml(valor: string): string {
    return valor
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private construirXmlPago(data: CrearPagoLoteDto): string {
    const cuentaEmpresa = data.cuentaEmpresa.padStart(11, '0');

    const items = data.detalles.map(
      (item: PagoDetalleItemDto, indice: number) => {
        const esTransferenciaBancaria =
          item.formaPago === 'CTA' || item.formaPago === 'SPI';
        const esVentanilla = item.formaPago === 'EFE';

        // 1) Código de orientación
        const codigo = 'PA';
        // 2) Cuenta de la empresa ordenante (11 dígitos, relleno con ceros)
        const cuentaEmp = cuentaEmpresa;
        // 3) Secuencial del pago (comienza en uno, por posición en el lote)
        const secuencial = String(indice + 1);
        // 4) Comprobante de pago
        const comprobante = item.comprobante || '';
        // 5) Contrapartida: cuenta (CTA/SPI) o identificación (CHQ/EFE)
        const contrapartida = esTransferenciaBancaria
          ? item.cuenta || ''
          : item.identificacion;
        // 6) Moneda
        const moneda = 'USD';
        // 7) Valor: 11 enteros + 2 decimales = 13 dígitos sin punto decimal
        const valor = String(Math.round(item.monto * 100)).padStart(13, '0');
        // 8) Forma de pago
        const formaPago = item.formaPago;
        // 9) Código de institución financiera (4 dígitos)
        const banco =
          item.bancoCodigo || (item.formaPago === 'SPI' ? '0001' : '0036');
        // 10) Tipo de cuenta (vacío para CHQ/EFE)
        const tipoCuenta = esVentanilla ? '' : item.tipoCuenta || '';
        // 11) Número de cuenta (vacío para CHQ/EFE)
        const cuenta = esVentanilla ? '' : item.cuenta || '';
        // 12) Tipo de identificación
        const tipoId = item.tipoId;
        // 13) Número de identificación
        const identificacion = item.identificacion;
        // 14) Nombre del beneficiario (máx 40)
        const nombre = item.nombre.substring(0, 40).replace(/[\t\r\n]/g, ' ');
        // 15-18) Dirección, ciudad, teléfono, localidad (opcionales: en blanco
        // pero conservando el TABULADOR según el formato)
        const direccion = '';
        const ciudad = '';
        const telefono = '';
        const localidad = '';
        // 19) Referencia (obligatoria, máx 200)
        const referencia = item.referencia.substring(0, 200);
        // 20) Referencia adicional con notificación: pipe + email
        const refAdicional = item.email ? `|${item.email}` : '';

        return [
          codigo,
          cuentaEmp,
          secuencial,
          comprobante,
          contrapartida,
          moneda,
          valor,
          formaPago,
          banco,
          tipoCuenta,
          cuenta,
          tipoId,
          identificacion,
          nombre,
          direccion,
          ciudad,
          telefono,
          localidad,
          referencia,
          refAdicional,
        ]
          .map((campo) => this.escapeXml(campo))
          .join('\t');
      },
    );

    const itemsXml = items.map((linea) => `  <Item>${linea}</Item>`).join('\n');

    // SIN la declaración <?xml?>: Produbanco responde "Trama inválida" con
    // ella (probado con scripts/diagnosticar-trama.ts; el manual §2.2.1
    // tampoco la incluye en el trama dentro del CDATA).
    return `<Envelope>
  <Empresa>${this.escapeXml(data.empresa)}</Empresa>
  <Id_Empresa>${this.escapeXml(data.idEmpresa)}</Id_Empresa>
  <Servicio>${this.escapeXml(data.servicio)}</Servicio>
  <Id_Servicio>${this.escapeXml(data.idServicio)}</Id_Servicio>
  <TipoCuenta>${this.escapeXml(data.tipoCuentaEmpresa)}</TipoCuenta>
  <NumeroCuenta>${cuentaEmpresa}</NumeroCuenta>
  <Referencia>${this.escapeXml(data.referenciaLote ?? '')}</Referencia>
  <FechaInicio>${data.fechaInicio}</FechaInicio>
  <FechaVencimiento>${data.fechaVencimiento}</FechaVencimiento>
  <Cabecera></Cabecera>
${itemsXml}
  <NumRecs>${data.detalles.length}</NumRecs>
</Envelope>`;
  }

  private construirXmlTransferencia(data: CrearTransferenciaLoteDto): string {
    const cuentaEmpresa = data.cuentaEmpresa.padStart(11, '0');

    const items = data.detalles.map(
      (item: TransferenciaDetalleItemDto, indice: number) => {
        // F20 RFB obligatorio: detalle!relación!gastos! (máx 43 chars, sin espacios)
        const rfb = `PAGO!COMERCIAL!${item.tipoComision || 'BEN'}!`;
        // F23 (INV) Facturas: referencia sin espacios, máx 26; si no viene,
        // usa la referenciaLote del lote (doc: campo opcional en exterior)
        const refFacturas = (item.referencia || data.referenciaLote || '')
          .replace(/\s+/g, '')
          .substring(0, 26);

        return [
          'PA', // F1  Código de orientación
          cuentaEmpresa, // F2  Cuenta empresa (11 dígitos)
          String(indice + 1), // F3  Secuencial (comienza en uno)
          item.comprobante || '', // F4  Comprobante (opcional)
          item.beneficiarioCuenta.substring(0, 34), // F5  Contrapartida (cuenta beneficiario)
          item.moneda || 'USD', // F6  Moneda (default USD)
          String(Math.round(item.monto * 100)).padStart(13, '0'), // F7  Valor 11+2 sin punto
          'CTA', // F8  Forma de pago (formato exterior solo CTA)
          item.codigoSwiftAba, // F9  SWIFT/ABA banco destino
          item.tipoCuenta, // F10 Tipo de cuenta destino
          item.beneficiarioCuenta.substring(0, 34), // F11 Número de cuenta beneficiario
          item.tipoId, // F12 Tipo ID beneficiario
          item.identificacion, // F13 Número ID beneficiario
          item.beneficiarioNombre.substring(0, 70).replace(/[\t\r\n]/g, ' '), // F14 Nombre
          '', // F15 Dirección (no ingresar)
          '', // F16 Ciudad (no ingresar)
          '', // F17 Teléfono (no ingresar)
          '', // F18 Localidad (no ingresar)
          '', // F19 Referencia (no ingresar)
          rfb, // F20 RFB: PAGO!COMERCIAL!{OUR|BEN|SHA}!
          '', // F21 (opcional)
          '', // F22 (opcional)
          refFacturas, // F23 (INV) Facturas / doc referencia
          item.motivoTransferencia, // F24 Motivo SIB "codigo,exencion"
          '', // F25 (opcional)
          '', // F26 (opcional)
          '', // F27 (opcional)
          '', // F28 (opcional)
          '', // F29 (opcional)
          '', // F30 DAU/DAI (opcional)
          '', // F31 Registro (opcional)
          '', // F32 Fecha registro (opcional)
          item.codigoExoneracionIsd || '', // F33 Nro. Formulario ISD (opcional)
          (item.bancoIntermediarioSwift || '').substring(0, 11), // F34 Banco intermediario
          '', // F35 Cta. banco intermediario (opcional)
          '', // F36 Contrato reaseguro (opcional)
          '', // F37 Código cotización (opcional)
        ]
          .map((campo) => this.escapeXml(campo))
          .join('\t');
      },
    );

    const itemsXml = items.map((linea) => `  <Item>${linea}</Item>`).join('\n');

    // SIN la declaración <?xml?>: causa "Trama inválida" en Produbanco
    // (ver scripts/diagnosticar-trama.ts y comentario en construirXmlPago).
    return `<Envelope>
  <Empresa>${this.escapeXml(data.empresa)}</Empresa>
  <Id_Empresa>${this.escapeXml(data.idEmpresa)}</Id_Empresa>
  <Servicio>${this.escapeXml(data.servicio)}</Servicio>
  <Id_Servicio>${this.escapeXml(data.idServicio)}</Id_Servicio>
  <TipoCuenta>${this.escapeXml(data.tipoCuentaEmpresa)}</TipoCuenta>
  <NumeroCuenta>${cuentaEmpresa}</NumeroCuenta>
  <Referencia>${this.escapeXml(data.referenciaLote ?? '')}</Referencia>
  <FechaInicio>${data.fechaInicio}</FechaInicio>
  <FechaVencimiento>${data.fechaVencimiento}</FechaVencimiento>
  <Cabecera></Cabecera>
${itemsXml}
  <NumRecs>${data.detalles.length}</NumRecs>
</Envelope>`;
  }

  private validarLotePago(data: CrearPagoLoteDto): void {
    if (!data.cuentaEmpresa || !data.referenciaLote) {
      throw new RpcException({
        statusCode: 400,
        message: 'Falta la cuenta de origen o la referencia del lote.',
      });
    }
    if (
      !data.detalles ||
      !Array.isArray(data.detalles) ||
      data.detalles.length === 0
    ) {
      throw new RpcException({
        statusCode: 400,
        message: 'El lote de pagos debe incluir al menos un detalle.',
      });
    }
    for (const [indice, item] of data.detalles.entries()) {
      if (item.formaPago === 'CTA' || item.formaPago === 'SPI') {
        if (!item.cuenta || !item.tipoCuenta) {
          throw new RpcException({
            statusCode: 400,
            message: `Detalle posición ${indice + 1}: cuenta y tipoCuenta son requeridos para formaPago ${item.formaPago}.`,
          });
        }
      }
      // El banco rechaza el ítem si los dígitos no coinciden con el tipo
      // (Formato PAGOS_FULL F12-F13). Error real: "NUMERO
      // IDENTIFICACION(R) INVALIDO" al enviar una cédula bajo tipo R.
      const digitos = (item.identificacion ?? '').trim().length;
      const digitosEsperados =
        item.tipoId === 'C' ? 10 : item.tipoId === 'R' ? 13 : undefined;
      if (digitosEsperados !== undefined && digitos !== digitosEsperados) {
        throw new RpcException({
          statusCode: 400,
          message: `Detalle posición ${indice + 1}: tipoId "${item.tipoId}" requiere exactamente ${digitosEsperados} dígitos de identificación (enviados: ${digitos}). C=cédula (10), R=RUC (13), P=pasaporte (5 a 13).`,
        });
      }
    }
  }

  private validarLoteTransferencia(data: CrearTransferenciaLoteDto): void {
    if (!data.cuentaEmpresa || !data.referenciaLote) {
      throw new RpcException({
        statusCode: 400,
        message: 'Falta la cuenta de origen o la referencia del lote.',
      });
    }
    if (
      !data.detalles ||
      !Array.isArray(data.detalles) ||
      data.detalles.length === 0
    ) {
      throw new RpcException({
        statusCode: 400,
        message: 'El lote de transferencias debe incluir al menos un detalle.',
      });
    }
    for (const [indice, item] of data.detalles.entries()) {
      // El banco rechaza el ítem si los dígitos no coinciden con el tipo
      // (Formato TRANSFER_FULL F12-F13: C=cédula 10, R=RUC 13, P=pasaporte
      // hasta 13) — mismo criterio que validarLotePago y error real
      // "NUMERO IDENTIFICACION(R) INVALIDO" probado en pagos.
      const digitos = (item.identificacion ?? '').trim().length;
      const digitosEsperados =
        item.tipoId === 'C' ? 10 : item.tipoId === 'R' ? 13 : undefined;
      if (digitosEsperados !== undefined && digitos !== digitosEsperados) {
        throw new RpcException({
          statusCode: 400,
          message: `Detalle posición ${indice + 1}: tipoId "${item.tipoId}" requiere exactamente ${digitosEsperados} dígitos de identificación (enviados: ${digitos}). C=cédula (10), R=RUC (13), P=pasaporte (5 a 13).`,
        });
      }
    }
  }
}
