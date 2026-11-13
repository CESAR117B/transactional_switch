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

    // Reintento con la MISMA Idempotency-Key: nunca se vuelve a enviar al
    // banco. Si ya terminó se devuelve la respuesta guardada; si está en
    // curso se responde 409; si el resultado es incierto se reconcilia.
    const previa = await this.lotes.buscarPorIdempotencyKey(idApp, key);
    if (previa) return this.resolverReintento(previa, idApp);

    // Hash del contenido sólo para diagnóstico/auditoría: la llave real de
    // idempotencia es Idempotency-Key.
    const requestHash = hashContenidoLote(data);
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

    try {
      // 2. Generar XML y consumir WebService Produbanco
      const xmlPlano = this.tramaBuilder.construirXmlPago(datos);
      const tramaEncriptada =
        await this.soapProdubanco.autenticarYEncriptar(xmlPlano);
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
      // 4. Registrar fallo en BD en caso de error de red o servidor bancario
      const info = infoErrorConBanco(error);
      await this.lotes.actualizarTransaccionErrorBD(
        transaccion.idTransaccion,
        info.message,
        info.respuestaBanco,
      );
      throw error;
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

    const previa = await this.lotes.buscarPorIdempotencyKey(idApp, key);
    if (previa) return this.resolverReintento(previa, idApp);

    const requestHash = hashContenidoLote(data);
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

    try {
      // 2. Generar XML con campos de exterior y consumir WebService
      const xmlPlano = this.tramaBuilder.construirXmlTransferencia(datos);
      const tramaEncriptada =
        await this.soapProdubanco.autenticarYEncriptar(xmlPlano);
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
      await this.lotes.actualizarTransaccionErrorBD(
        transaccion.idTransaccion,
        info.message,
        info.respuestaBanco,
      );
      throw error;
    }
  }

  /**
   * Resuelve un reintento con la MISMA Idempotency-Key:
   * - PROCESADO_BANCO: devuelve la respuesta original sin volver a enviar.
   * - PENDIENTE reciente: 409, la carga original sigue en curso.
   * - PENDIENTE viejo o ERROR: reconcilia contra Produbanco (consulta, nunca
   *   reenvía la carga). Si el banco confirma la orden, devuelve la respuesta;
   *   si no, 409 indicando que debe usarse una Idempotency-Key nueva.
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

    // Resultado incierto: consultar al banco sin reenviar la carga.
    const secretKey = await this.lotes.getEncryptionKey(idApp);
    await this.consulta.consultarBanco(tx, secretKey);
    if (tx.status === EstadoTransaccion.PROCESADO_BANCO) {
      return this.lotes.respuestaDeTransaccion(tx);
    }

    throw new RpcException({
      statusCode: 409,
      message:
        'La operación con esta Idempotency-Key no se completó' +
        (tx.errorMessage ? `: ${tx.errorMessage}` : '.') +
        ' Generá una Idempotency-Key nueva para reintentar.',
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
