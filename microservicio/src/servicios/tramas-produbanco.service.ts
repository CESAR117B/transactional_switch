import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { ConfigDbService } from '../config-db/config-db.service';
import { CrearPagoLoteDto } from '../dto/crear-pago-lote.dto';
import { CrearTransferenciaLoteDto } from '../dto/crear-transferencia-lote.dto';
import { ProdubancoSoapService } from '../integraciones/produbanco-soap.service';
import { ConsultaTransaccionesService } from '../produbanco/consulta-transacciones.service';
import {
  parametrizarPago,
  parametrizarTransferencia,
} from '../produbanco/detalle.mapper';
import { LotesRepository } from '../produbanco/lotes.repository';
import {
  EstadoTransaccion,
  OPERACIONES_PRODUBANCO,
  TxConDetalles,
} from '../produbanco/produbanco.types';
import {
  fechasVigenciaSobre,
  hashContenidoLote,
  infoErrorConBanco,
  normalizarIdempotencyKey,
  clasificarErrorCarga,
  comoObjeto,
} from '../produbanco/produbanco.utils';
import { TramaBuilderService } from '../produbanco/trama-builder.service';

// Re-export de compatibilidad: el resto del código importa el enum y el
// tipo desde este servicio.
export { EstadoTransaccion } from '../produbanco/produbanco.types';
export type { EstadoBanco } from '../produbanco/produbanco.types';

/**
 * Orquestador de operaciones Produbanco: valida, delega el armado de la
 * trama a TramaBuilderService, la persistencia/idempotencia a
 * LotesRepository y las consultas/sincronización a
 * ConsultaTransaccionesService.
 */
@Injectable()
export class TramasProdubancoService {
  /** Únicas operaciones de Produbanco (compatibilidad con job/controlador). */
  public static readonly OPERACIONES_PRODUBANCO: string[] =
    OPERACIONES_PRODUBANCO;

  constructor(
    private readonly soapProdubanco: ProdubancoSoapService,
    private readonly configDb: ConfigDbService,
    private readonly lotes: LotesRepository,
    private readonly tramaBuilder: TramaBuilderService,
    private readonly consulta: ConsultaTransaccionesService,
  ) {}

  /**
   * Procesa y persiste un lote de pagos locales en Produbanco.
   */
  async generarPago(
    idApp: number,
    data: CrearPagoLoteDto,
    idempotencyKey?: string,
  ) {
    const key = normalizarIdempotencyKey(idempotencyKey);

    // El hash del contenido se calcula SIEMPRE antes de resolver un reintento:
    // una misma llave con otro cuerpo debe fallar (no devolver la respuesta
    // del lote original como si fuera la misma operación).
    const requestHash = hashContenidoLote(data);

    // Reintento con la MISMA Idempotency-Key: nunca se vuelve a enviar al
    // banco. Si ya terminó se devuelve la respuesta guardada; si está en
    // curso se responde 409; si el resultado es incierto se reconcilia.
    const previa = await this.lotes.buscarPorIdempotencyKey(idApp, key);
    if (previa) {
      this.validarContenidoReintento(previa, requestHash);
      return this.resolverReintento(previa, idApp);
    }

    const config = await this.configDb.getProdubancoConfig();
    const datos = parametrizarPago(
      data,
      config,
      fechasVigenciaSobre(),
    );
    datos.referenciaLote = await this.lotes.generarReferenciaLote(idApp);
    this.tramaBuilder.validarLotePago(datos);
    // Límite anti-duplicado: mismo monto + misma cuenta beneficiario en la
    // misma app dentro de la ventana (409). Antes de persistir: un
    // duplicado rechazado nunca crea filas en BD.
    await this.lotes.validarDuplicadosRecientes(
      idApp,
      datos.detalles.map((item) => ({
        cuenta: item.cuenta,
        monto: item.monto,
      })),
    );

    // 1. Guardar en BD en estado PENDIENTE con sus detalles.
    // La fila se crea ANTES de llamar al banco; la unique
    // [idApp, idempotencyKey] resuelve la carrera entre reintentos.
    let transaccion;
    try {
      transaccion = await this.lotes.guardarTransaccionPagoBD(
        idApp,
        datos,
        requestHash,
        key,
      );
    } catch (error: unknown) {
      const reintento = await this.lotes.conflictoIdempotencia(
        idApp,
        key,
        error,
      );
      if (reintento) return this.resolverReintento(reintento, idApp);
      throw error;
    }

    // Fase A: armar la trama y autenticarla. Si falla acá, la carga NUNCA se
    // envió al banco: es un rechazo definitivo y se puede reintentar con otra
    // Idempotency-Key.
    let tramaEncriptada: string;
    try {
      const xmlPlano = this.tramaBuilder.construirXmlPago(datos);
      tramaEncriptada =
        await this.soapProdubanco.autenticarYEncriptar(xmlPlano);
    } catch (error: unknown) {
      const info = infoErrorConBanco(error);
      await this.lotes.actualizarTransaccionErrorBD(
        transaccion.idTransaccion,
        info.message,
        info.respuestaBanco,
        true,
      );
      throw error;
    }

    // Fase B: enviar la carga. El timeout de CargaDirectaXml NO cancela la
    // petición de fondo: un error acá puede ser un pago ya procesado.
    try {
      const { envioId, estado, respuesta } =
        await this.soapProdubanco.cargarDirectaXml(tramaEncriptada);

      // 3. Actualizar BD con el Envio_Id y respuesta exitosa del banco
      await this.lotes.actualizarTransaccionExitoBD(
        transaccion.idTransaccion,
        envioId,
        estado,
        respuesta,
      );

      // Respuesta reducida: solo la referencia (Cifrada) y el total abonado.
      // transaccion.reference es el referenceEncrypted ya persistido; NO se
      // re-cifra aquí (el IV es aleatorio y no coincidiría).
      return {
        referenciaLote: transaccion.reference,
        montoTotal: data.detalles.reduce((acc, item) => acc + item.monto, 0),
      };
    } catch (error: unknown) {
      const info = infoErrorConBanco(error);

      // Rechazo explícito del banco (o fallo antes de enviar): definitivo.
      if (clasificarErrorCarga(error) === 'definitivo') {
        await this.lotes.actualizarTransaccionErrorBD(
          transaccion.idTransaccion,
          info.message,
          info.respuestaBanco,
          true,
        );
        throw error;
      }

      // Resultado incierto: se conserva la fila para reconciliar por cron y
      // se responde sin invitar a una llave nueva (sería un pago doble).
      await this.lotes.actualizarTransaccionInciertaBD(
        transaccion.idTransaccion,
        info.message,
        info.respuestaBanco,
      );
      throw this.errorResultadoIncierto(
        transaccion.idTransaccion,
        info.message,
      );
    }
  }

  /**
   * Procesa y persiste un lote de transferencias internacionales.
   */
  async generarTransferencia(
    idApp: number,
    data: CrearTransferenciaLoteDto,
    idempotencyKey?: string,
  ) {
    const key = normalizarIdempotencyKey(idempotencyKey);

    const requestHash = hashContenidoLote(data);

    const previa = await this.lotes.buscarPorIdempotencyKey(idApp, key);
    if (previa) {
      this.validarContenidoReintento(previa, requestHash);
      return this.resolverReintento(previa, idApp);
    }

    const config = await this.configDb.getProdubancoConfig();
    const datos = parametrizarTransferencia(
      data,
      config,
      fechasVigenciaSobre(),
    );
    datos.referenciaLote = await this.lotes.generarReferenciaLote(idApp);
    this.tramaBuilder.validarLoteTransferencia(datos);
    await this.lotes.validarDuplicadosRecientes(
      idApp,
      datos.detalles.map((item) => ({
        cuenta: item.beneficiarioCuenta,
        monto: item.monto,
      })),
    );

    // 1. Guardar en BD en estado PENDIENTE (antes de llamar al banco)
    let transaccion;
    try {
      transaccion = await this.lotes.guardarTransaccionTransferenciaBD(
        idApp,
        datos,
        requestHash,
        key,
      );
    } catch (error: unknown) {
      const reintento = await this.lotes.conflictoIdempotencia(
        idApp,
        key,
        error,
      );
      if (reintento) return this.resolverReintento(reintento, idApp);
      throw error;
    }

    // Fase A: armar la trama y autenticarla (nada se envió todavía).
    let tramaEncriptada: string;
    try {
      const xmlPlano = this.tramaBuilder.construirXmlTransferencia(datos);
      tramaEncriptada =
        await this.soapProdubanco.autenticarYEncriptar(xmlPlano);
    } catch (error: unknown) {
      const info = infoErrorConBanco(error);
      await this.lotes.actualizarTransaccionErrorBD(
        transaccion.idTransaccion,
        info.message,
        info.respuestaBanco,
        true,
      );
      throw error;
    }

    // Fase B: enviar la carga; un timeout puede ser un pago ya procesado.
    try {
      const { envioId, estado, respuesta } =
        await this.soapProdubanco.cargarDirectaXml(tramaEncriptada);

      // 3. Actualizar BD con confirmación del banco
      await this.lotes.actualizarTransaccionExitoBD(
        transaccion.idTransaccion,
        envioId,
        estado,
        respuesta,
      );

      return {
        referenciaLote: transaccion.reference,
        montoTotal: data.detalles.reduce((acc, item) => acc + item.monto, 0),
      };
    } catch (error: unknown) {
      const info = infoErrorConBanco(error);

      if (clasificarErrorCarga(error) === 'definitivo') {
        await this.lotes.actualizarTransaccionErrorBD(
          transaccion.idTransaccion,
          info.message,
          info.respuestaBanco,
          true,
        );
        throw error;
      }

      await this.lotes.actualizarTransaccionInciertaBD(
        transaccion.idTransaccion,
        info.message,
        info.respuestaBanco,
      );
      throw this.errorResultadoIncierto(
        transaccion.idTransaccion,
        info.message,
      );
    }
  }

  /**
   * La misma Idempotency-Key con otro contenido es un error del cliente:
   * devolver la respuesta del lote original sería aceptar una operación
   * distinta como si fuera la misma.
   */
  private validarContenidoReintento(
    previa: TxConDetalles,
    requestHash: string,
  ): void {
    if (previa.requestHash && previa.requestHash !== requestHash) {
      throw new RpcException({
        statusCode: 422,
        message:
          'La Idempotency-Key ya se usó con otro contenido. ' +
          'Generá una llave nueva sólo si la operación anterior fue rechazada ' +
          'definitivamente; si quedó incierta, consultá su estado.',
        error: 'Unprocessable Entity',
      });
    }
  }

  /**
   * Resuelve un reintento con la MISMA Idempotency-Key:
   * - PROCESADO_BANCO: devuelve la respuesta original sin volver a enviar.
   * - PENDIENTE reciente: 409, la carga original sigue en curso.
   * - INCIERTO o PENDIENTE viejo: reconcilia contra Produbanco (consulta,
   *   nunca reenvía). Si el banco confirma, devuelve la respuesta; si no,
   *   409 de estado desconocido SIN pedir una llave nueva.
   * - ERROR definitivo (rechazo explícito): 409 habilitando una llave nueva.
   * - ERROR sin la marca de definitivo (filas legacy): se trata como incierto.
   */
  private async resolverReintento(tx: TxConDetalles, idApp: number) {
    if (tx.status === EstadoTransaccion.PROCESADO_BANCO) {
      return this.lotes.respuestaDeTransaccion(tx);
    }

    const creadaMs = tx.createdAt?.getTime?.() ?? 0;
    const enCurso = Date.now() - creadaMs < 2 * 60 * 1000;
    if (tx.status === EstadoTransaccion.PENDIENTE && enCurso) {
      throw new RpcException({
        statusCode: 409,
        message:
          'Ya hay una operación en curso con esta Idempotency-Key. ' +
          'Esperá su resultado antes de reintentar.',
        error: 'Conflict',
      });
    }

    const response = comoObjeto(tx.responsePayload);
    const rechazoDefinitivo =
      tx.status === EstadoTransaccion.ERROR &&
      response['rechazoDefinitivo'] === true;

    if (rechazoDefinitivo) {
      throw new RpcException({
        statusCode: 409,
        message:
          'La operación con esta Idempotency-Key fue rechazada definitivamente' +
          (tx.errorMessage ? `: ${tx.errorMessage}` : '.') +
          ' Podés reintentar con una Idempotency-Key nueva.',
        error: 'Conflict',
      });
    }

    // Resultado incierto (INCIERTO, PENDIENTE viejo o ERROR legacy):
    // consultar al banco sin reenviar la carga.
    const secretKey = await this.lotes.getEncryptionKey(idApp);
    await this.consulta.consultarBanco(tx, secretKey);
    if (tx.status === EstadoTransaccion.PROCESADO_BANCO) {
      return this.lotes.respuestaDeTransaccion(tx);
    }

    throw new RpcException({
      statusCode: 409,
      message:
        'El resultado de esta Idempotency-Key es desconocido; no se pudo ' +
        'confirmar con el banco' +
        (tx.errorMessage ? ` (${tx.errorMessage})` : '') +
        '. NO generes una llave nueva: reintentá con la misma para consultar ' +
        'o esperá la reconciliación automática.',
      error: 'Conflict',
    });
  }

  /** Error 409 para el primer intento con resultado incierto. */
  private errorResultadoIncierto(
    idTransaccion: bigint,
    detalle: string,
  ): RpcException {
    return new RpcException({
      statusCode: 409,
      message:
        `No se pudo confirmar el resultado de la carga (idTransaccion=${idTransaccion}): ` +
        `${detalle}. La operación quedó en estado INCIERTO y se reconciliará ` +
        'automáticamente. NO uses una Idempotency-Key nueva: reintentá con la ' +
        'misma para consultar su estado.',
      error: 'Conflict',
    });
  }

  // ==========================================
  // DELEGACIÓN A CONSULTA DE TRANSACCIONES
  // ==========================================

  consultarTransacciones(
    idApp: number,
    params: Parameters<ConsultaTransaccionesService['consultarTransacciones']>[1],
  ) {
    return this.consulta.consultarTransacciones(idApp, params);
  }

  consultarEstadoTransaccion(
    idApp: number,
    params: Parameters<
      ConsultaTransaccionesService['consultarEstadoTransaccion']
    >[1],
  ) {
    return this.consulta.consultarEstadoTransaccion(idApp, params);
  }

  transaccionesAdmin(
    params: Parameters<ConsultaTransaccionesService['transaccionesAdmin']>[0] = {},
  ) {
    return this.consulta.transaccionesAdmin(params);
  }

  estadoTransaccionAdmin(
    params: Parameters<
      ConsultaTransaccionesService['estadoTransaccionAdmin']
    >[0] = {},
  ) {
    return this.consulta.estadoTransaccionAdmin(params);
  }

  sincronizarEstadoProdubanco(
    idTransaccion: bigint,
  ): ReturnType<ConsultaTransaccionesService['sincronizarEstadoProdubanco']> {
    return this.consulta.sincronizarEstadoProdubanco(idTransaccion);
  }
}
