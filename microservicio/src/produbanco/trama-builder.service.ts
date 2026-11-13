import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PagoDetalleItemDto } from '../dto/crear-pago-lote.dto';
import { TransferenciaDetalleItemDto } from '../dto/crear-transferencia-lote.dto';
import { DatosPago, DatosTransferencia } from './produbanco.types';
import { escapeXml } from './produbanco.utils';

/**
 * Armado y validación de las tramas XML de Produbanco (PAGOS_FULL y
 * TRANSFER_FULL). Sin estado ni acceso a BD: sólo transforma los datos ya
 * parametrizados del lote.
 */
@Injectable()
export class TramaBuilderService {
  construirXmlPago(data: DatosPago): string {
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
          .map((campo) => escapeXml(campo))
          .join('\t');
      },
    );

    return this.envolver(data, items);
  }

  construirXmlTransferencia(data: DatosTransferencia): string {
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
          item.beneficiarioNombre
            .substring(0, 70)
            .replace(/[\t\r\n]/g, ' '), // F14 Nombre
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
          .map((campo) => escapeXml(campo))
          .join('\t');
      },
    );

    return this.envolver(data, items);
  }

  validarLotePago(data: DatosPago): void {
    this.validarCabecera(data, 'pagos');
    for (const [indice, item] of data.detalles.entries()) {
      if (item.formaPago === 'CTA' || item.formaPago === 'SPI') {
        if (!item.cuenta || !item.tipoCuenta) {
          throw new RpcException({
            statusCode: 400,
            message: `Detalle posición ${indice + 1}: cuenta y tipoCuenta son requeridos para formaPago ${item.formaPago}.`,
          });
        }
      }
      this.validarIdentificacion(item.tipoId, item.identificacion, indice);
    }
  }

  validarLoteTransferencia(data: DatosTransferencia): void {
    this.validarCabecera(data, 'transferencias');
    for (const [indice, item] of data.detalles.entries()) {
      this.validarIdentificacion(item.tipoId, item.identificacion, indice);
    }
  }

  private envolver(
    data: DatosPago | DatosTransferencia,
    items: string[],
  ): string {
    const cuentaEmpresa = data.cuentaEmpresa.padStart(11, '0');
    const itemsXml = items.map((linea) => `  <Item>${linea}</Item>`).join('\n');

    // SIN la declaración <?xml?>: Produbanco responde "Trama inválida" con
    // ella (probado con scripts/diagnosticar-trama.ts; el manual §2.2.1
    // tampoco la incluye en la trama dentro del CDATA).
    return `<Envelope>
  <Empresa>${escapeXml(data.empresa)}</Empresa>
  <Id_Empresa>${escapeXml(data.idEmpresa)}</Id_Empresa>
  <Servicio>${escapeXml(data.servicio)}</Servicio>
  <Id_Servicio>${escapeXml(data.idServicio)}</Id_Servicio>
  <TipoCuenta>${escapeXml(data.tipoCuentaEmpresa)}</TipoCuenta>
  <NumeroCuenta>${cuentaEmpresa}</NumeroCuenta>
  <Referencia>${escapeXml(data.referenciaLote ?? '')}</Referencia>
  <FechaInicio>${data.fechaInicio}</FechaInicio>
  <FechaVencimiento>${data.fechaVencimiento}</FechaVencimiento>
  <Cabecera></Cabecera>
${itemsXml}
  <NumRecs>${data.detalles.length}</NumRecs>
</Envelope>`;
  }

  private validarCabecera(
    data: DatosPago | DatosTransferencia,
    tipoLote: string,
  ): void {
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
        message: `El lote de ${tipoLote} debe incluir al menos un detalle.`,
      });
    }
  }

  /**
   * El banco rechaza el ítem si los dígitos no coinciden con el tipo
   * (Formato PAGOS_FULL/TRANSFER_FULL F12-F13). Error real: "NUMERO
   * IDENTIFICACION(R) INVALIDO" al enviar una cédula bajo tipo R.
   */
  private validarIdentificacion(
    tipoId: string,
    identificacion: string,
    indice: number,
  ): void {
    const digitos = (identificacion ?? '').trim().length;
    const digitosEsperados =
      tipoId === 'C' ? 10 : tipoId === 'R' ? 13 : undefined;
    if (digitosEsperados !== undefined && digitos !== digitosEsperados) {
      throw new RpcException({
        statusCode: 400,
        message: `Detalle posición ${indice + 1}: tipoId "${tipoId}" requiere exactamente ${digitosEsperados} dígitos de identificación (enviados: ${digitos}). C=cédula (10), R=RUC (13), P=pasaporte (5 a 13).`,
      });
    }
  }
}
