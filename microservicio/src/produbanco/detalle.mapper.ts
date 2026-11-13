import {
  CrearPagoLoteDto,
  PagoDetalleItemDto,
  TipoCuenta,
} from '../dto/crear-pago-lote.dto';
import {
  CrearTransferenciaLoteDto,
  TransferenciaDetalleItemDto,
  TipoCuentaBanco,
} from '../dto/crear-transferencia-lote.dto';
import { hashBusqueda } from '../servicios/hash-busqueda';
import { UniversalCryptoService } from '../servicios/universal-crypto.service';
import { DatosPago, DatosTransferencia } from './produbanco.types';

/**
 * Detalle de lote normalizado: un único shape para pagos y transferencias,
 * resuelto desde cada DTO por los normalizadores. Así el mapeo a Prisma
 * (cifrado + hashes) existe una sola vez.
 */
export interface DetalleLoteNormalizado {
  tipoId: string;
  identificacion: string;
  nombre: string;
  cuenta: string | null;
  bancoCodigo: string | null;
  monto: number;
  moneda: string;
  formaPago: string;
  referenciaDocumento: string | null;
  codigoSwiftAba: string | null;
  conceptoInvisibles: string | null;
  codigoExoneracionIsd: string | null;
}

/** Detalle de pago local → shape común. */
export function normalizarDetallePago(
  item: PagoDetalleItemDto,
): DetalleLoteNormalizado {
  return {
    tipoId: item.tipoId,
    identificacion: item.identificacion,
    nombre: item.nombre,
    cuenta: item.cuenta ?? null,
    bancoCodigo:
      item.formaPago === 'CTA' ? '0036' : item.bancoCodigo || null,
    monto: item.monto,
    moneda: 'USD',
    formaPago: item.formaPago,
    referenciaDocumento: item.referencia || null,
    codigoSwiftAba: null,
    conceptoInvisibles: null,
    codigoExoneracionIsd: null,
  };
}

/** Detalle de transferencia al exterior → shape común. */
export function normalizarDetalleTransferencia(
  item: TransferenciaDetalleItemDto,
): DetalleLoteNormalizado {
  return {
    tipoId: item.tipoId,
    identificacion: item.identificacion,
    nombre: item.beneficiarioNombre,
    cuenta: item.beneficiarioCuenta,
    bancoCodigo: item.codigoSwiftAba
      ? item.codigoSwiftAba.substring(0, 10)
      : null,
    monto: item.monto,
    moneda: item.moneda || 'USD',
    formaPago: 'SPI',
    referenciaDocumento: item.referencia || null,
    codigoSwiftAba: item.codigoSwiftAba || null,
    conceptoInvisibles: item.conceptoInvisibles ?? null,
    codigoExoneracionIsd: item.codigoExoneracionIsd || '0',
  };
}

export interface FechasDetalle {
  fechaInicioDate: Date;
  fechaFinDate: Date;
}

/**
 * Mapea un detalle normalizado al create anidado de
 * transacciones_bancarias_detalle, cifrando identificación, cuenta y
 * SWIFT y calculando los hashes HMAC de búsqueda. Único lugar donde se
 * define qué campos sensibles del detalle se cifran.
 */
export function mapearDetalle(
  detalle: DetalleLoteNormalizado,
  secuencia: number,
  secretKey: string,
  fechas: FechasDetalle,
  crypto: UniversalCryptoService,
) {
  return {
    secuencia,
    beneficiarioTipoId: detalle.tipoId,
    beneficiarioIdentificacion: crypto.encrypt(
      detalle.identificacion,
      secretKey,
    ),
    beneficiarioIdentificacionHash: hashBusqueda(
      detalle.identificacion,
      secretKey,
    ),
    beneficiarioNombre: detalle.nombre,
    beneficiarioCuenta: detalle.cuenta
      ? crypto.encrypt(detalle.cuenta, secretKey)
      : null,
    beneficiarioCuentaHash: detalle.cuenta
      ? hashBusqueda(detalle.cuenta, secretKey)
      : null,
    beneficiarioBancoCodigo: detalle.bancoCodigo,
    monto: detalle.monto,
    moneda: detalle.moneda,
    formaPago: detalle.formaPago,
    referenciaDocumento: detalle.referenciaDocumento,
    codigoSwiftAba: detalle.codigoSwiftAba
      ? crypto.encrypt(detalle.codigoSwiftAba, secretKey)
      : detalle.codigoSwiftAba,
    conceptoInvisibles: detalle.conceptoInvisibles,
    codigoExoneracionIsd: detalle.codigoExoneracionIsd,
    fechaInicio: fechas.fechaInicioDate,
    fechaFin: fechas.fechaFinDate,
    estadoItem: 'PENDIENTE',
  };
}

/** Payload de auditoría del pago con los campos sensibles cifrados. */
export function cifrarPayloadPago(
  data: DatosPago,
  referenceEncrypted: string,
  secretKey: string,
  crypto: UniversalCryptoService,
) {
  return {
    ...JSON.parse(JSON.stringify(data)),
    cuentaEmpresa: crypto.encrypt(data.cuentaEmpresa, secretKey),
    referenciaLote: referenceEncrypted,
    detalles: data.detalles.map((d) => ({
      ...JSON.parse(JSON.stringify(d)),
      identificacion: crypto.encrypt(d.identificacion, secretKey),
      cuenta: d.cuenta ? crypto.encrypt(d.cuenta, secretKey) : d.cuenta,
    })),
  };
}

/** Payload de auditoría de la transferencia con los campos cifrados. */
export function cifrarPayloadTransferencia(
  data: DatosTransferencia,
  referenceEncrypted: string,
  secretKey: string,
  crypto: UniversalCryptoService,
) {
  return {
    ...JSON.parse(JSON.stringify(data)),
    cuentaEmpresa: crypto.encrypt(data.cuentaEmpresa, secretKey),
    referenciaLote: referenceEncrypted,
    detalles: data.detalles.map((d) => ({
      ...JSON.parse(JSON.stringify(d)),
      beneficiarioCuenta: crypto.encrypt(d.beneficiarioCuenta, secretKey),
      codigoSwiftAba: d.codigoSwiftAba
        ? crypto.encrypt(d.codigoSwiftAba, secretKey)
        : d.codigoSwiftAba,
    })),
  };
}

/**
 * Parametriza el DTO de pago con la configuración bancaria de BD.
 * servicio/idServicio NO se inyectan: varían por operación y los envía
 * el cliente.
 */
export function parametrizarPago(
  data: CrearPagoLoteDto,
  cfg: {
    numerocuenta: string;
    tipocuenta: string;
    empresa: string;
    idempresa: string;
  },
  fechas: FechasDetalle & { fechaInicio: string; fechaVencimiento: string },
): DatosPago {
  return {
    ...data,
    cuentaEmpresa: cfg.numerocuenta,
    tipoCuentaEmpresa: cfg.tipocuenta as TipoCuenta,
    empresa: cfg.empresa,
    idEmpresa: cfg.idempresa,
    ...fechas,
  };
}

/** Ídem parametrizarPago para transferencias al exterior. */
export function parametrizarTransferencia(
  data: CrearTransferenciaLoteDto,
  cfg: {
    numerocuenta: string;
    tipocuenta: string;
    empresa: string;
    idempresa: string;
  },
  fechas: FechasDetalle & { fechaInicio: string; fechaVencimiento: string },
): DatosTransferencia {
  return {
    ...data,
    cuentaEmpresa: cfg.numerocuenta,
    tipoCuentaEmpresa: cfg.tipocuenta as TipoCuentaBanco,
    empresa: cfg.empresa,
    idEmpresa: cfg.idempresa,
    ...fechas,
  };
}
