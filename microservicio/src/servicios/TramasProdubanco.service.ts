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
      const tramaEncriptada =
        await this.soapProdubanco.autenticarYEncriptar(xmlPlano);
      const envioId =
        await this.soapProdubanco.cargarDirectaXml(tramaEncriptada);

      // 3. Actualizar BD con el Envio_Id y respuesta exitosa del banco[cite: 4]
      await this.actualizarTransaccionExitoBD(
        transaccion.idTransaccion,
        envioId,
      );

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
      await this.actualizarTransaccionErrorBD(
        transaccion.idTransaccion,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Procesa y persiste un lote de transferencias internacionales (Transfer Full).
   */
  async generarTransferencia(idApp: number, data: CrearTransferenciaLoteDto) {
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
      const envioId =
        await this.soapProdubanco.cargarDirectaXml(tramaEncriptada);

      // 3. Actualizar BD con confirmación del banco[cite: 4]
      await this.actualizarTransaccionExitoBD(
        transaccion.idTransaccion,
        envioId,
      );

      return {
        exito: true,
        idTransaccion: transaccion.idTransaccion.toString(),
        referenciaLote: data.referenciaLote,
        envioId,
        totalRegistros: data.detalles.length,
        montoTotal: data.detalles.reduce((acc, item) => acc + item.monto, 0),
      };
    } catch (error: any) {
      await this.actualizarTransaccionErrorBD(
        transaccion.idTransaccion,
        error.message,
      );
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
  private async guardarTransaccionPagoBD(
    idApp: number,
    data: CrearPagoLoteDto,
  ) {
    const secretKey = await this.getEncryptionKey(idApp);
    const referenceEncrypted = this.universalCryptoService.encrypt(
      data.referenciaLote,
      secretKey,
    );
    const referenceHash = this.sha256(data.referenciaLote);

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

    // Opción A - Idempotencia: si referenceHash ya existe, permite reintento solo si estado=ERROR
    const existing = await this.prisma.transaccionesServicios.findUnique({
      where: { referenceHash },
      select: { idTransaccion: true, status: true, idApp: true },
    });
    if (existing) {
      if (existing.status === EstadoTransaccion.ERROR) {
        this.logger.warn(
          `Reintentando lote con referencia duplicada ${data.referenciaLote} (hash=${referenceHash}) idTransaccion=${existing.idTransaccion} status=ERROR -> reciclando`,
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
            requestPayload: payloadCifrado,
            responsePayload: {},
            status: EstadoTransaccion.PENDIENTE,
            errorMessage: null,
            detalles: {
              create: data.detalles.map((item: PagoDetalleItemDto) => ({
                secuencia: item.secuencia,
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
              })),
            },
          },
        });
      }
      // PENDIENTE o PROCESADO_BANCO -> conflicto, cliente debe usar nueva referenciaLote
      throw new RpcException({
        statusCode: 409,
        message: `Lote con referencia ${data.referenciaLote} ya existe (estado=${existing.status === EstadoTransaccion.PENDIENTE ? 'PENDIENTE' : existing.status === EstadoTransaccion.PROCESADO_BANCO ? 'PROCESADO_BANCO' : existing.status}). Use una referenciaLote nueva.`,
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
        requestPayload: payloadCifrado,
        responsePayload: {},
        status: EstadoTransaccion.PENDIENTE,
        detalles: {
          create: data.detalles.map((item: PagoDetalleItemDto) => ({
            secuencia: item.secuencia,
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
          })),
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
      data.referenciaLote,
      secretKey,
    );
    const referenceHash = this.sha256(data.referenciaLote);

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

    const existing = await this.prisma.transaccionesServicios.findUnique({
      where: { referenceHash },
      select: { idTransaccion: true, status: true },
    });
    if (existing) {
      if (existing.status === EstadoTransaccion.ERROR) {
        this.logger.warn(
          `Reintentando transferencia con referencia duplicada ${data.referenciaLote} (hash=${referenceHash}) idTransaccion=${existing.idTransaccion} status=ERROR -> reciclando`,
        );
        await this.prisma.transaccionesBancariasDetalle.deleteMany({
          where: { idTransaccion: existing.idTransaccion },
        });
        return this.prisma.transaccionesServicios.update({
          where: { idTransaccion: existing.idTransaccion },
          data: {
            idApp,
            reference: referenceEncrypted,
            requestPayload: payloadCifrado,
            responsePayload: {},
            status: EstadoTransaccion.PENDIENTE,
            errorMessage: null,
            detalles: {
              create: data.detalles.map(
                (item: TransferenciaDetalleItemDto) => ({
                  secuencia: item.secuencia,
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
        message: `Transferencia con referencia ${data.referenciaLote} ya existe (estado=${existing.status === EstadoTransaccion.PENDIENTE ? 'PENDIENTE' : existing.status === EstadoTransaccion.PROCESADO_BANCO ? 'PROCESADO_BANCO' : existing.status}). Use nueva referenciaLote.`,
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
        requestPayload: payloadCifrado,
        responsePayload: {},
        status: EstadoTransaccion.PENDIENTE,
        detalles: {
          create: data.detalles.map((item: TransferenciaDetalleItemDto) => ({
            secuencia: item.secuencia,
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
          })),
        },
      },
    });
  }

  /**
   * Actualiza la transacción a éxito cuando Produbanco retorna el Envio_Id[cite: 4].
   */
  private async actualizarTransaccionExitoBD(
    idTransaccion: bigint,
    envioId: string,
  ) {
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
  private async actualizarTransaccionErrorBD(
    idTransaccion: bigint,
    mensajeError: string,
  ) {
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

    const items = data.detalles.map((item: PagoDetalleItemDto) => {
      const esTransferenciaBancaria =
        item.formaPago === 'CTA' || item.formaPago === 'SPI';
      const esVentanilla = item.formaPago === 'EFE';

      // 1) Código de orientación
      const codigo = 'PA';
      // 2) Cuenta de la empresa ordenante (11 dígitos, relleno con ceros)
      const cuentaEmp = cuentaEmpresa;
      // 3) Secuencial del pago
      const secuencial = String(item.secuencia);
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
    });

    const itemsXml = items.map((linea) => `  <Item>${linea}</Item>`).join('\n');

    return `<?xml version="1.0" encoding="utf-8"?>
<Envelope>
  <Empresa>${this.escapeXml(data.empresa)}</Empresa>
  <Id_Empresa>${this.escapeXml(data.idEmpresa)}</Id_Empresa>
  <Servicio>${this.escapeXml(data.servicio)}</Servicio>
  <Id_Servicio>${this.escapeXml(data.idServicio)}</Id_Servicio>
  <TipoCuenta>${this.escapeXml(data.tipoCuentaEmpresa)}</TipoCuenta>
  <NumeroCuenta>${cuentaEmpresa}</NumeroCuenta>
  <Referencia>${this.escapeXml(data.referenciaLote)}</Referencia>
  <FechaInicio>${data.fechaInicio}</FechaInicio>
  <FechaVencimiento>${data.fechaVencimiento}</FechaVencimiento>
  <Cabecera></Cabecera>
${itemsXml}
  <NumRecs>${data.detalles.length}</NumRecs>
</Envelope>`;
  }

  private construirXmlTransferencia(data: CrearTransferenciaLoteDto): string {
    const cuentaEmpresa = data.cuentaEmpresa.padStart(11, '0');

    const items = data.detalles.map((item: TransferenciaDetalleItemDto) => {
      // F20 RFB obligatorio: detalle!relación!gastos! (máx 43 chars, sin espacios)
      const rfb = `PAGO!COMERCIAL!${item.tipoComision || 'BEN'}!`;
      // F23 (INV) Facturas: referencia sin espacios, máx 26
      const refFacturas = (item.referencia || '')
        .replace(/\s+/g, '')
        .substring(0, 26);

      return [
        'PA', // F1  Código de orientación
        cuentaEmpresa, // F2  Cuenta empresa (11 dígitos)
        String(item.secuencia), // F3  Secuencial
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
    });

    const itemsXml = items.map((linea) => `  <Item>${linea}</Item>`).join('\n');

    return `<?xml version="1.0" encoding="utf-8"?>
<Envelope>
  <Empresa>${this.escapeXml(data.empresa)}</Empresa>
  <Id_Empresa>${this.escapeXml(data.idEmpresa)}</Id_Empresa>
  <Servicio>${this.escapeXml(data.servicio)}</Servicio>
  <Id_Servicio>${this.escapeXml(data.idServicio)}</Id_Servicio>
  <TipoCuenta>${this.escapeXml(data.tipoCuentaEmpresa)}</TipoCuenta>
  <NumeroCuenta>${cuentaEmpresa}</NumeroCuenta>
  <Referencia>${this.escapeXml(data.referenciaLote)}</Referencia>
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
    for (const item of data.detalles) {
      if (item.formaPago === 'CTA' || item.formaPago === 'SPI') {
        if (!item.cuenta || !item.tipoCuenta) {
          throw new RpcException({
            statusCode: 400,
            message: `Detalle secuencia ${item.secuencia}: cuenta y tipoCuenta son requeridos para formaPago ${item.formaPago}.`,
          });
        }
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
  }
}
