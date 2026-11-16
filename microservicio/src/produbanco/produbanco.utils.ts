import { RpcException } from '@nestjs/microservices';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { CrearPagoLoteDto } from '../dto/crear-pago-lote.dto';
import { CrearTransferenciaLoteDto } from '../dto/crear-transferencia-lote.dto';
import {
  EstadoTransaccion,
  FechasSobre,
  OPERACIONES_PRODUBANCO,
} from './produbanco.types';

/** sha256 hex (usado para referenceHash y búsquedas deterministas). */
export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Escapa un campo para la trama XML. El tabulador es el separador de
 * columnas: se reemplaza junto con los saltos de línea para que ningún
 * campo pueda inyectar columnas ni romper el XML.
 */
export function escapeXml(valor: string): string {
  return valor
    .replace(/[\t\r\n]/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Normaliza info_app.nombre a código [A-Z0-9] (máx 15); vacío -> null. */
export function normalizarNombreApp(nombre?: string | null): string | null {
  if (!nombre) return null;
  const limpio = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .substring(0, 15);
  return limpio || null;
}

/** 'dd/mm/yyyy' → Date a medianoche UTC (para columnas @db.Date). */
export function parsearFechaCorta(fecha: string): Date {
  const [dia, mes, anio] = fecha.split('/').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia));
}

/**
 * Vigencia del sobre para el <Envelope> (Manual §2.1.1): hoy → hoy + 1.
 * Se calcula en America/Guayaquil (UTC-5, sin DST), la zona de referencia
 * del banco, para evitar corrimientos de día por la zona del servidor.
 */
export function fechasVigenciaSobre(): FechasSobre {
  const formatear = (fecha: Date): string =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Guayaquil',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(fecha); // dd/mm/yyyy

  const ahora = new Date();
  const fechaInicio = formatear(ahora);
  const fechaVencimiento = formatear(
    new Date(ahora.getTime() + 24 * 60 * 60 * 1000),
  );

  return {
    fechaInicio,
    fechaVencimiento,
    // Date a medianoche UTC derivado del MISMO string dd/mm/yyyy que va al
    // banco: así la columna @db.Date guarda exactamente el día enviado.
    fechaInicioDate: parsearFechaCorta(fechaInicio),
    fechaFinDate: parsearFechaCorta(fechaVencimiento),
  };
}

/** Normaliza un Json de Prisma a objeto accesible sin `any`. */
export function comoObjeto(json: unknown): Record<string, unknown> {
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    return json as Record<string, unknown>;
  }
  return {};
}

/** Convierte string|number desconocido a string ('' si no aplica). */
export function aTexto(valor: unknown): string {
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number') return String(valor);
  return '';
}

/**
 * Suma montos monetarios con `Prisma.Decimal` para evitar el error de coma
 * flotante del `reduce` sobre `number` (p. ej. 0.1 + 0.2).
 *
 * Acepta `number`, `string` o `Prisma.Decimal`, ignora valores vacíos o no
 * numéricos (mismo criterio tolerante que el reduce anterior) y devuelve un
 * `number` redondeado a 2 decimales: no cambia el contrato de las respuestas,
 * que siguen exponiendo un número.
 */
export function sumarMontos(montos: ReadonlyArray<unknown>): number {
  let total = new Prisma.Decimal(0);
  for (const monto of montos) {
    if (monto === null || monto === undefined || monto === '') continue;
    try {
      const decimal = new Prisma.Decimal(monto as Prisma.Decimal.Value);
      if (decimal.isFinite()) total = total.plus(decimal);
    } catch {
      // Valor no convertible: se ignora, igual que el reduce anterior.
    }
  }
  return total.toDecimalPlaces(2).toNumber();
}

/** Nombre legible del estado interno de la cabecera. */
export function textoEstado(status: number): string {
  switch (status) {
    case EstadoTransaccion.PENDIENTE:
      return 'PENDIENTE';
    case EstadoTransaccion.PROCESADO_BANCO:
      return 'PROCESADO_BANCO';
    case EstadoTransaccion.ERROR:
      return 'ERROR';
    case EstadoTransaccion.INCIERTO:
      return 'INCIERTO';
    default:
      return 'DESCONOCIDO';
  }
}

/** Extrae el message de un error desconocido sin usar `any`. */
export function infoError(error: unknown): { message: string } {
  const e = error as { message?: unknown } | undefined;
  return {
    message:
      typeof e?.message === 'string'
        ? e.message
        : 'Error consultando Produbanco',
  };
}

/**
 * Extrae message y la respuesta cruda adjunta (`respuestaBanco`, si el
 * servicio SOAP la adjuntó al rechazar la carga) sin usar `any`.
 */
export function infoErrorConBanco(error: unknown): {
  message: string;
  respuestaBanco: string | null;
} {
  const e = error as
    | { message?: unknown; respuestaBanco?: unknown }
    | undefined;
  return {
    message: typeof e?.message === 'string' ? e.message : 'Error desconocido',
    respuestaBanco:
      typeof e?.respuestaBanco === 'string' ? e.respuestaBanco : null,
  };
}

/**
 * Clasifica el fallo de una carga a Produbanco:
 * - `definitivo`: el banco respondió con un rechazo (respuesta cruda adjunta)
 *   o la petición falló antes de enviarse. Es seguro reintentar con otra
 *   Idempotency-Key.
 * - `incierto`: timeout, error de red o respuesta no confirmada. La carga pudo
 *   haberse procesado: hay que reconciliar, nunca reenviar con llave nueva.
 */
export function clasificarErrorCarga(
  error: unknown,
): 'definitivo' | 'incierto' {
  const e = error as
    | { message?: unknown; respuestaBanco?: unknown }
    | undefined;
  if (
    typeof e?.respuestaBanco === 'string' &&
    e.respuestaBanco.trim() !== ''
  ) {
    return 'definitivo';
  }
  const mensaje = typeof e?.message === 'string' ? e.message : '';
  if (
    /Produbanco no registró la carga|Produbanco rechazó CargaDirectaXml/i.test(
      mensaje,
    )
  ) {
    return 'definitivo';
  }
  return 'incierto';
}

/**
 * Normaliza la operación a filtrar: válida (Produbanco) → el string tal
 * cual; ausente, no string o valor de otro servicio → null.
 */
export function operacionValida(operation?: string): string | null {
  if (typeof operation !== 'string') return null;
  const op = operation.trim();
  return OPERACIONES_PRODUBANCO.includes(op) ? op : null;
}

/**
 * sha256 del contenido del lote SIN referenciaLote — huella de
 * diagnóstico/auditoría (la llave real de idempotencia es Idempotency-Key).
 */
export function hashContenidoLote(
  data: CrearPagoLoteDto | CrearTransferenciaLoteDto,
): string {
  const contenido = JSON.stringify(data, (key: string, value: unknown) =>
    key === 'referenciaLote' ? undefined : value,
  );
  return sha256(contenido);
}

/**
 * Valida y normaliza la `Idempotency-Key`. Sin llave no hay garantía de que
 * un reintento no ejecute el pago dos veces, así que el microservicio falla
 * cerrado (400) aunque el gateway ya la exija.
 */
export function normalizarIdempotencyKey(idempotencyKey?: string): string {
  const key = idempotencyKey?.trim();
  if (!key) {
    throw new RpcException({
      statusCode: 400,
      message:
        'idempotencyKey es requerida. Generá un UUID por operación y ' +
        'reutilizalo exactamente igual en cada reintento.',
      error: 'Bad Request',
    });
  }
  if (key.length > 100) {
    throw new RpcException({
      statusCode: 400,
      message: 'idempotencyKey supera el máximo de 100 caracteres.',
      error: 'Bad Request',
    });
  }
  return key;
}
