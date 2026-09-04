import { Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service'; // Ajusta la ruta a tu PrismaService
import { ProdubancoSoapService } from '../Integraciones/ProdubancoSoap.service';
import { CrearPagoLoteDto, PagoDetalleItemDto } from './dto/crear-pago-lote.dto';
import { CrearTransferenciaLoteDto, TransferenciaDetalleItemDto } from './dto/crear-transferencia-lote.dto';
import { UniversalCryptoService } from './universal-crypto.service';
import * as crypto from 'crypto';


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
    private readonly universalCryptoService: UniversalCryptoService,
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

  /**
   * Crea el registro de Cabecera y Detalle para Pagos Locales[cite: 4].
   * Cifra en BD: cuentaEmpresa, identificacion, cuenta, reference (via referenceEncrypted + referenceHash unique). Client desencripta con encryptionKey.
   */
  private async guardarTransaccionPagoBD(idApp: number, data: CrearPagoLoteDto) {
    const secretKey = await this.getEncryptionKey(idApp);
    const referenceEncrypted = this.universalCryptoService.encrypt(data.referenciaLote, secretKey);
    const referenceHash = this.sha256(data.referenciaLote);

    // Payload cifrado: cuentaEmpresa + identificacion + cuenta dentro de detalles
    const payloadCifrado = {
      ...JSON.parse(JSON.stringify(data)),
      cuentaEmpresa: this.universalCryptoService.encrypt(data.cuentaEmpresa, secretKey),
      referenciaLote: referenceEncrypted, // tambien cifrado en payload para no exponer referencia
      detalles: data.detalles.map((d) => ({
        ...JSON.parse(JSON.stringify(d)),
        identificacion: this.universalCryptoService.encrypt(d.identificacion, secretKey),
        cuenta: d.cuenta ? this.universalCryptoService.encrypt(d.cuenta, secretKey) : d.cuenta,
      })),
    };

    return this.prisma.transaccionesServicios.create({
      data: {
        servicio: 'PRODUBANCO',
        idApp: idApp,
        operation: 'SPR_PRODUBANCO-PAGO',
        reference: referenceEncrypted,
        referenceHash,
        requestPayload: payloadCifrado,
        responsePayload: {},
        status: EstadoTransaccion.PENDIENTE,
        detalles: {
          create: data.detalles.map((item: PagoDetalleItemDto) => ({
            secuencia: item.secuencia,
            beneficiarioTipoId: item.tipoId,
            beneficiarioIdentificacion: this.universalCryptoService.encrypt(item.identificacion, secretKey),
            beneficiarioNombre: item.nombre,
            beneficiarioCuenta: item.cuenta ? this.universalCryptoService.encrypt(item.cuenta, secretKey) : null,
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
   * Cifra en BD: cuentaEmpresa, identificacion (beneficiarioCuenta), cuenta (beneficiarioCuenta), reference.
   */
  private async guardarTransaccionTransferenciaBD(idApp: number, data: CrearTransferenciaLoteDto) {
    const secretKey = await this.getEncryptionKey(idApp);
    const referenceEncrypted = this.universalCryptoService.encrypt(data.referenciaLote, secretKey);
    const referenceHash = this.sha256(data.referenciaLote);

    const payloadCifrado = {
      ...JSON.parse(JSON.stringify(data)),
      cuentaEmpresa: this.universalCryptoService.encrypt(data.cuentaEmpresa, secretKey),
      referenciaLote: referenceEncrypted,
      detalles: data.detalles.map((d) => ({
        ...JSON.parse(JSON.stringify(d)),
        beneficiarioCuenta: this.universalCryptoService.encrypt(d.beneficiarioCuenta, secretKey),
        codigoSwiftAba: d.codigoSwiftAba ? this.universalCryptoService.encrypt(d.codigoSwiftAba, secretKey) : d.codigoSwiftAba,
      })),
    };

    return this.prisma.transaccionesServicios.create({
      data: {
        servicio: 'PRODUBANCO',
        idApp: idApp,
        operation: 'SPR_PRODUBANCO-TRANSFERENCIA_EXTERIOR',
        reference: referenceEncrypted,
        referenceHash,
        requestPayload: payloadCifrado,
        responsePayload: {},
        status: EstadoTransaccion.PENDIENTE,
        detalles: {
          create: data.detalles.map((item: TransferenciaDetalleItemDto) => ({
            secuencia: item.secuencia,
            beneficiarioTipoId: 'P', // Pasaporte o identificación internacional por defecto
            beneficiarioIdentificacion: this.universalCryptoService.encrypt(item.beneficiarioCuenta, secretKey),
            beneficiarioNombre: item.beneficiarioNombre,
            beneficiarioCuenta: this.universalCryptoService.encrypt(item.beneficiarioCuenta, secretKey),
            beneficiarioBancoCodigo: item.codigoSwiftAba ? this.universalCryptoService.encrypt(item.codigoSwiftAba, secretKey) : item.codigoSwiftAba,
            monto: item.monto,
            moneda: 'USD',
            formaPago: 'SPI',
            referenciaDocumento: item.referencia || null,
            codigoSwiftAba: item.codigoSwiftAba ? this.universalCryptoService.encrypt(item.codigoSwiftAba, secretKey) : item.codigoSwiftAba,
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