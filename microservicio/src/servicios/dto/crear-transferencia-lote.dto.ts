export type TipoComision = 'OUR' | 'BEN' | 'SHA'; // OUR: Corre por cuenta del ordenante, BEN: Beneficiario, SHA: Compartido

export class TransferenciaDetalleItemDto {
  secuencia: number;
  beneficiarioNombre: string;
  beneficiarioDireccion: string;
  beneficiarioCuenta: string; // IBAN o Número de Cuenta Internacional
  bancoDestinoNombre: string;
  bancoDestinoDireccion?: string;
  codigoSwiftAba: string; // Código SWIFT (BIC) o ABA del banco destino[cite: 6]
  bancoIntermediarioSwift?: string; // Opcional: SWIFT del banco intermediario[cite: 6]
  monto: number;
  conceptoInvisibles: string; // Motivo/concepto de la transferencia según catálogo SIB[cite: 6]
  codigoExoneracionIsd?: string; // Código de exoneración del Impuesto a la Salida de Divisas (si aplica)[cite: 6]
  tipoComision?: TipoComision;
  referencia?: string;
}

export class CrearTransferenciaLoteDto {
  cuentaEmpresa: string;
  referenciaLote: string;
  detalles: TransferenciaDetalleItemDto[];
}