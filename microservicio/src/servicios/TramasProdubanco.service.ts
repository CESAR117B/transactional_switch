import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ProdubancoSoapService } from '../Integraciones/ProdubancoSoap.service';
import { CrearPagoLoteDto, PagoDetalleItemDto } from './dto/crear-pago-lote.dto';
import { CrearTransferenciaLoteDto, TransferenciaDetalleItemDto } from './dto/crear-transferencia-lote.dto';


@Injectable()
export class TramasProdubancoService {
  private readonly logger = new Logger(TramasProdubancoService.name);

  constructor(private readonly soapProdubanco: ProdubancoSoapService) {}

  /**
   * Procesa un lote de pagos locales: construye el XML, lo encripta en Produbanco y transmite la orden.
   */
  async generarPago(idApp: number, data: CrearPagoLoteDto) {
    this.validarLotePago(data);

    // 1. Construir la trama XML delimitada por tabuladores según especificación Produbanco[cite: 5]
    const xmlPlano = this.construirXmlPago(data);
    this.logger.debug(`XML Plano generado para idApp=${idApp}`);

    // 2. Obtener la trama encriptada llamando a DevuelveXmlEncriptado[cite: 7]
    const tramaEncriptada = await this.soapProdubanco.autenticarYEncriptar(xmlPlano);

    // 3. Enviar el sobre a Produbanco llamando a CargaDirectaXml[cite: 7]
    const envioId = await this.soapProdubanco.cargarDirectaXml(tramaEncriptada);

    return {
      exito: true,
      idApp,
      referenciaLote: data.referenciaLote,
      envioId, // ID único asignado por Produbanco para seguimiento/conciliación[cite: 7]
      totalRegistros: data.detalles.length,
      montoTotal: data.detalles.reduce((acc, item) => acc + item.monto, 0),
    };
  }

  /**
   * Arma la estructura XML / plana de Pagos Full requerida por el WebService SOAP[cite: 5, 7].
   */
  private construirXmlPago(data: CrearPagoLoteDto): string {
    // Formatear cada fila separada por tabuladores '\t'[cite: 5]
    const lineasDetalle = data.detalles
      .map((item: PagoDetalleItemDto) => {
        const montoFormateado = item.monto.toFixed(2);
        const banco = item.formaPago === 'CTA' ? '0036' : item.bancoCodigo || '0000';

        return [
          item.secuencia,
          item.tipoId,
          item.identificacion,
          item.nombre.substring(0, 40).replace(/[\t\r\n]/g, ' '), // Limpieza de caracteres de escape
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

  /**
   * Validaciones pre-ejecución del lote de pagos
   */
  private validarLotePago(data: CrearPagoLoteDto): void {
    if (!data.cuentaEmpresa || !data.referenciaLote) {
      throw new BadRequestException('Falta la cuenta de origen o la referencia del lote.');
    }

    if (!data.detalles || !Array.isArray(data.detalles) || data.detalles.length === 0) {
      throw new BadRequestException('El lote de pagos debe incluir al menos un detalle de beneficiario.');
    }

    for (const item of data.detalles) {
      if (!item.identificacion || !item.nombre || !item.monto || item.monto <= 0) {
        throw new BadRequestException(
          `Registro secuencia ${item.secuencia}: Datos incompletos o monto inválido.`,
        );
      }

      if (['CTA', 'SPI'].includes(item.formaPago) && !item.cuenta) {
        throw new BadRequestException(
          `Registro secuencia ${item.secuencia}: La forma de pago ${item.formaPago} requiere número de cuenta.`,
        );
      }
    }
  }



  async generarTransferencia(idApp: number, data: CrearTransferenciaLoteDto) {
    this.validarLoteTransferencia(data);

    // 1. Construir la trama XML con campos SWIFT/ABA y normativas SIB/ISD[cite: 6]
    const xmlPlano = this.construirXmlTransferencia(data);
    this.logger.debug(`XML Transferencia al Exterior generado para idApp=${idApp}`);

    // 2. Encriptar las credenciales + XML[cite: 7]
    const tramaEncriptada = await this.soapProdubanco.autenticarYEncriptar(xmlPlano);

    // 3. Enviar el sobre a Produbanco[cite: 7]
    const envioId = await this.soapProdubanco.cargarDirectaXml(tramaEncriptada);

    return {
      exito: true,
      idApp,
      referenciaLote: data.referenciaLote,
      envioId,
      totalRegistros: data.detalles.length,
      montoTotal: data.detalles.reduce((acc, item) => acc + item.monto, 0),
    };
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


  private validarLoteTransferencia(data: CrearTransferenciaLoteDto): void {
    if (!data.cuentaEmpresa || !data.referenciaLote) {
      throw new BadRequestException('Falta la cuenta de origen o la referencia del lote.');
    }

    if (!data.detalles || !Array.isArray(data.detalles) || data.detalles.length === 0) {
      throw new BadRequestException('El lote de transferencias debe incluir al menos un detalle.');
    }

    for (const item of data.detalles) {
      if (
        !item.beneficiarioNombre ||
        !item.beneficiarioCuenta ||
        !item.codigoSwiftAba ||
        !item.conceptoInvisibles ||
        !item.monto ||
        item.monto <= 0
      ) {
        throw new BadRequestException(
          `Registro secuencia ${item.secuencia}: Faltan campos obligatorios para transferencia al exterior (SWIFT/ABA, Cuenta o Concepto SIB).`,
        );
      }
    }
  }
}