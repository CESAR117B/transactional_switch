export type TipoIdentificacion = 'C' | 'R' | 'P'; // C: Cédula, R: RUC, P: Pasaporte[cite: 5]
export type FormaPago = 'CTA' | 'SPI' | 'CHQ' | 'EFE'; // CTA: Produbanco, SPI: Otro Banco, CHQ: Cheque, EFE: Ventanilla[cite: 5]

export class PagoDetalleItemDto {
  secuencia: number;
  tipoId: TipoIdentificacion;
  identificacion: string;
  nombre: string;
  formaPago: FormaPago;
  cuenta?: string;
  bancoCodigo?: string; // Código de banco destino para SPI (ej: "0036")[cite: 5]
  monto: number;
  referencia?: string; // Número de factura o concepto[cite: 5]
}

export class CrearPagoLoteDto {
  cuentaEmpresa: string;
  referenciaLote: string;
  detalles: PagoDetalleItemDto[];
}