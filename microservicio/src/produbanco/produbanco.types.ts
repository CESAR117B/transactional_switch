import { Prisma } from '@prisma/client';
import {
  CrearPagoLoteDto,
  TipoCuenta,
} from '../dto/crear-pago-lote.dto';
import {
  CrearTransferenciaLoteDto,
  TipoCuentaBanco,
} from '../dto/crear-transferencia-lote.dto';

// Estados transaccionales internos
export enum EstadoTransaccion {
  PENDIENTE = 1,
  PROCESADO_BANCO = 2,
  ERROR = 3,
}

/** Únicas operaciones de Produbanco: todo listado/consulta se limita a estas. */
export const OPERACIONES_PRODUBANCO: string[] = [
  'SPR_PRODUBANCO-PAGO',
  'SPR_PRODUBANCO-TRANSFERENCIA_EXTERIOR',
];

export type TxConDetalles = Prisma.TransaccionesServiciosGetPayload<{
  include: { detalles: true };
}>;

export type TxListado = Prisma.TransaccionesServiciosGetPayload<{
  include: {
    detalles: {
      select: {
        secuencia: boolean;
        monto: boolean;
        estadoItem: boolean;
        beneficiarioIdentificacion: boolean;
        beneficiarioCuenta: boolean;
      };
    };
  };
}>;

/** DTO de pago + parametrización bancaria inyectada desde config BD
 * (atributos_integraciones): cuenta, tipo, empresa e idEmpresa. El cliente
 * sólo envía servicio/idServicio (varían pago interbancario vs exterior). */
export type DatosPago = CrearPagoLoteDto & {
  cuentaEmpresa: string;
  tipoCuentaEmpresa: TipoCuenta;
  empresa: string;
  idEmpresa: string;
  /** Vigencia del sobre generada por el back (no la envía el cliente):
   * hoy → hoy + 1, America/Guayaquil. Ver fechasVigenciaSobre(). */
  fechaInicio: string;
  fechaVencimiento: string;
  /** Mismas fechas como Date (UTC midnight) para persistir en
   * transacciones_bancarias_detalle.fecha_inicio/fecha_fin (@db.Date). */
  fechaInicioDate: Date;
  fechaFinDate: Date;
};

/** Ídem DatosPago para transferencias; servicio/idServicio vienen del DTO. */
export type DatosTransferencia = CrearTransferenciaLoteDto & {
  cuentaEmpresa: string;
  tipoCuentaEmpresa: TipoCuentaBanco;
  empresa: string;
  idEmpresa: string;
  /** Vigencia del sobre generada por el back (no la envía el cliente):
   * hoy → hoy + 1, America/Guayaquil. Ver fechasVigenciaSobre(). */
  fechaInicio: string;
  fechaVencimiento: string;
  /** Mismas fechas como Date (UTC midnight) para persistir en
   * transacciones_bancarias_detalle.fecha_inicio/fecha_fin (@db.Date). */
  fechaInicioDate: Date;
  fechaFinDate: Date;
};

/** Registro de Consulta_Sobres_VIEW (Manual §2.2.1). */
export interface SobreBanco {
  Id_Sobre?: number | string;
  Estado_Sobre?: string;
  Referencia?: string;
  Numero_Items?: number | string;
  Valor_Sobre?: number | string;
}

/** Registro de Movimientos_Out (Manual §2.3.1). */
export interface MovimientoBanco {
  Estado_Proceso?: string;
  Mensaje?: string;
}

/** Bloque de estado bancario incluido en la respuesta de consulta. */
export interface EstadoBanco {
  consultado: boolean;
  sinDatos?: boolean;
  /** Cómo se buscó la orden: por Envio_Id o, si el Envio_Id no sirve
   * (p. ej. 0), por la Referencia registrada en la carga (Manual §2.2.1). */
  consultaPor?: 'envioId' | 'referencia';
  /** CodRetorno del SOAP (ej. 0005 = sin datos). */
  codigo?: string | null;
  /** MsjRetorno verbatim del banco. */
  mensaje?: string | null;
  motivo?: string;
  error?: string;
  orden?: SobreBanco | null;
  movimientos?: MovimientoBanco[];
  /** Tramas SOAP crudas intercambiadas en esta consulta (para auditoría). */
  tramas?: import('../integraciones/produbanco-soap.service').TramaSoap[];
}

/** Fechas de vigencia del sobre (strings dd/mm/yyyy + Dates UTC). */
export interface FechasSobre {
  fechaInicio: string;
  fechaVencimiento: string;
  fechaInicioDate: Date;
  fechaFinDate: Date;
}
