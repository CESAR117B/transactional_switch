import { Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service'; // Ajusta la ruta a tu PrismaService
import { ProdubancoSoapService } from '../Integraciones/ProdubancoSoap.service';
import { CrearPagoLoteDto, PagoDetalleItemDto } from './dto/crear-pago-lote.dto';
import { CrearTransferenciaLoteDto, TransferenciaDetalleItemDto } from './dto/crear-transferencia-lote.dto';


// Estados transaccionales internos
export enum EstadoTransaccion {
  PENDIENTE = 1,
  PROCESADO_BANCO = 2,
  ERROR = 3,
}

@Injectable()
export class TramasProdubancoService {
  private readonly logger = new Logger(TramasProdubancoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly soapProdubanco: ProdubancoSoapService,
  ) {}

  /**
   * Procesa y persiste un lote de pagos locales en Produbanco.
   */
  async generarPago(idApp: number, data: CrearPagoLoteDto) {
    this.validarLotePago(data);

    // 1. Guardar en BD en estado PENDIENTE con sus detalles[cite: 4]
    const transaccion = await this.guardarTransaccionPagoBD(idApp, data);

    try {
      // 2. Generar XML y consumir WebService Produbanco
      const xmlPlano = this.construirXmlPago(data);
      const tramaEncriptada = await this.soapProdubanco.autenticarYEncriptar(xmlPlano);
      const envioId = await this.soapProdubanco.cargarDirectaXml(tramaEncriptada);

      // 3. Actualizar BD con el Envio_Id y respuesta exitosa del banco[cite: 4]
      await this.actualizarTransaccionExitoBD(transaccion.idTransaccion, envioId);

      return {
        exito: true,
        idTransaccion: transaccion.idTransaccion.toString(),
        referenciaLote: data.referenciaLote,
        envioId,
        totalRegistros: data.detalles.length,
        montoTotal: data.detalles.reduce((acc, item) => acc + item.monto, 0),
      };
    } catch (error: any) {
      // 4. Registrar fallo en BD en caso de error en la red o servidor bancario[cite: 4]
      await this.actualizarTransaccionErrorBD(transaccion.idTransaccion, error.message);
      throw error;
    }
  }

  /**
   * Procesa y persiste un lote de transferencias internacionales (Transfer Full).
   */
  async generarTransferencia(idApp: number, data: CrearTransferenciaLoteDto) {
    this.validarLoteTransferencia(data);

    // 1. Guardar en BD en estado PENDIENTE[cite: 4]
    const transaccion = await this.guardarTransaccionTransferenciaBD(idApp, data);

    try {
      // 2. Generar XML con campos de exterior y consumir WebService
      const xmlPlano = this.construirXmlTransferencia(data);
      const tramaEncriptada = await this.soapProdubanco.autenticarYEncriptar(xmlPlano);
      const envioId = await this.soapProdubanco.cargarDirectaXml(tramaEncriptada);

      // 3. Actualizar BD con confirmación del banco[cite: 4]
      await this.actualizarTransaccionExitoBD(transaccion.idTransaccion, envioId);

      return {
        exito: true,
        idTransaccion: transaccion.idTransaccion.toString(),
        referenciaLote: data.referenciaLote,
        envioId,
        totalRegistros: data.detalles.length,
        montoTotal: data.detalles.reduce((acc, item) => acc + item.monto, 0),
      };
    } catch (error: any) {
      await this.actualizarTransaccionErrorBD(transaccion.idTransaccion, error.message);
      throw error;
    }
  }

  // ==========================================
  // MÉTODOS DE PERSISTENCIA EN BD (PRISMA)
  // ==========================================

  /**
   * Crea el registro de Cabecera y Detalle para Pagos Locales[cite: 4].
   */
  private async guardarTransaccionPagoBD(idApp: number, data: CrearPagoLoteDto) {
    return this.prisma.transaccionesServicios.create({
      data: {
        servicio: 'PRODUBANCO',
        idApp: idApp,
        operation: 'SPR_PRODUBANCO-PAGO',
        reference: data.referenciaLote,
        requestPayload: JSON.parse(JSON.stringify(data)),
        responsePayload: {},
        status: EstadoTransaccion.PENDIENTE,
        detalles: {
          create: data.detalles.map((item: PagoDetalleItemDto) => ({
            secuencia: item.secuencia,
            beneficiarioTipoId: item.tipoId,
            beneficiarioIdentificacion: item.identificacion,
            beneficiarioNombre: item.nombre,
            beneficiarioCuenta: item.cuenta || null,
            beneficiarioBancoCodigo: item.formaPago === 'CTA' ? '0036' : item.bancoCodigo || null,
            monto: item.monto,
            moneda: 'USD',
            formaPago: item.formaPago,
            referenciaDocumento: item.referencia || null,
            estadoItem: 'PENDIENTE',
          })),
        },
      },
    });
  }

  /**
   * Crea el registro de Cabecera y Detalle para Transferencias al Exterior[cite: 4].
   */
  private async guardarTransaccionTransferenciaBD(idApp: number, data: CrearTransferenciaLoteDto) {
    return this.prisma.transaccionesServicios.create({
      data: {
        servicio: 'PRODUBANCO',
        idApp: idApp,
        operation: 'SPR_PRODUBANCO-TRANSFERENCIA_EXTERIOR',
        reference: data.referenciaLote,
        requestPayload: JSON.parse(JSON.stringify(data)),
        responsePayload: {},
        status: EstadoTransaccion.PENDIENTE,
        detalles: {
          create: data.detalles.map((item: TransferenciaDetalleItemDto) => ({
            secuencia: item.secuencia,
            beneficiarioTipoId: 'P', // Pasaporte o identificación internacional por defecto
            beneficiarioIdentificacion: item.beneficiarioCuenta,
            beneficiarioNombre: item.beneficiarioNombre,
            beneficiarioCuenta: item.beneficiarioCuenta,
            beneficiarioBancoCodigo: item.codigoSwiftAba,
            monto: item.monto,
            moneda: 'USD',
            formaPago: 'SPI',
            referenciaDocumento: item.referencia || null,
            codigoSwiftAba: item.codigoSwiftAba,
            conceptoInvisibles: item.conceptoInvisibles,
            codigoExoneracionIsd: item.codigoExoneracionIsd || '0',
            estadoItem: 'PENDIENTE',
          })),
        },
      },
    });
  }

  /**
   * Actualiza la transacción a éxito cuando Produbanco retorna el Envio_Id[cite: 4].
   */
  private async actualizarTransaccionExitoBD(idTransaccion: bigint, envioId: string) {
    return this.prisma.transaccionesServicios.update({
      where: { idTransaccion },
      data: {
        status: EstadoTransaccion.PROCESADO_BANCO,
        responsePayload: {
          envioId,
          mensaje: 'Carga aceptada correctamente por Produbanco',
        },
      },
    });
  }

  /**
   * Marca la transacción con estado de error en caso de fallo en la red/SOAP[cite: 4].
   */
  private async actualizarTransaccionErrorBD(idTransaccion: bigint, mensajeError: string) {
    return this.prisma.transaccionesServicios.update({
      where: { idTransaccion },
      data: {
        status: EstadoTransaccion.ERROR,
        errorMessage: mensajeError,
        responsePayload: {
          error: mensajeError,
        },
      },
    });
  }

  // ==========================================
  // HELPER MÉTODOS DE FORMATO DE TRAMA XML
  // ==========================================

  private construirXmlPago(data: CrearPagoLoteDto): string {
    const lineasDetalle = data.detalles
      .map((item: PagoDetalleItemDto) => {
        const montoFormateado = item.monto.toFixed(2);
        const banco = item.formaPago === 'CTA' ? '0036' : item.bancoCodigo || '0000';

        return [
          item.secuencia,
          item.tipoId,
          item.identificacion,
          item.nombre.substring(0, 40).replace(/[\t\r\n]/g, ' '),
          item.formaPago,
          item.cuenta || '',
          banco,
          montoFormateado,
          item.referencia || '',
        ].join('\t');
      })
      .join('\n');

    return `<?xml version="1.0" encoding="utf-8"?>
<ORDEN>
  <CABECERA>
    <CUENTA_ORIGEN>${data.cuentaEmpresa}</CUENTA_ORIGEN>
    <REFERENCIA>${data.referenciaLote}</REFERENCIA>
    <REGISTROS>${data.detalles.length}</REGISTROS>
  </CABECERA>
  <DETALLE>
<![CDATA[
${lineasDetalle}
]]>
  </DETALLE>
</ORDEN>`;
  }

  private construirXmlTransferencia(data: CrearTransferenciaLoteDto): string {
    const lineasDetalle = data.detalles
      .map((item: TransferenciaDetalleItemDto) => {
        const montoFormateado = item.monto.toFixed(2);
        const comision = item.tipoComision || 'OUR';

        return [
          item.secuencia,
          item.beneficiarioNombre.substring(0, 35).replace(/[\t\r\n]/g, ' '),
          item.beneficiarioDireccion.substring(0, 35).replace(/[\t\r\n]/g, ' '),
          item.beneficiarioCuenta,
          item.bancoDestinoNombre.substring(0, 35).replace(/[\t\r\n]/g, ' '),
          (item.bancoDestinoDireccion || '').substring(0, 35).replace(/[\t\r\n]/g, ' '),
          item.codigoSwiftAba,
          item.bancoIntermediarioSwift || '',
          montoFormateado,
          item.conceptoInvisibles,
          item.codigoExoneracionIsd || '0',
          comision,
          item.referencia || '',
        ].join('\t');
      })
      .join('\n');

    return `<?xml version="1.0" encoding="utf-8"?>
<ORDEN_EXTERIOR>
  <CABECERA>
    <CUENTA_ORIGEN>${data.cuentaEmpresa}</CUENTA_ORIGEN>
    <REFERENCIA>${data.referenciaLote}</REFERENCIA>
    <REGISTROS>${data.detalles.length}</REGISTROS>
  </CABECERA>
  <DETALLE>
<![CDATA[
${lineasDetalle}
]]>
  </DETALLE>
</ORDEN_EXTERIOR>`;
  }

  private validarLotePago(data: CrearPagoLoteDto): void {
    if (!data.cuentaEmpresa || !data.referenciaLote) {
      throw new RpcException({ statusCode: 400, message: 'Falta la cuenta de origen o la referencia del lote.' });
    }
    if (!data.detalles || !Array.isArray(data.detalles) || data.detalles.length === 0) {
      throw new RpcException({ statusCode: 400, message: 'El lote de pagos debe incluir al menos un detalle.' });
    }
  }

  private validarLoteTransferencia(data: CrearTransferenciaLoteDto): void {
    if (!data.cuentaEmpresa || !data.referenciaLote) {
      throw new RpcException({ statusCode: 400, message: 'Falta la cuenta de origen o la referencia del lote.' });
    }
    if (!data.detalles || !Array.isArray(data.detalles) || data.detalles.length === 0) {
      throw new RpcException({ statusCode: 400, message: 'El lote de transferencias debe incluir al menos un detalle.' });
    }
  }
}