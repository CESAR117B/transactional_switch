import { BadRequestException } from '@nestjs/common';

/** Máximo aceptado para `Idempotency-Key` (coincide con la columna en BD). */
const MAX_LENGTH = 100;

/**
 * Valida y normaliza el header `Idempotency-Key`.
 *
 * El cliente debe generar un UUID por operación y reutilizarlo en cada
 * reintento. Sin esta llave no se puede garantizar que un pago no se
 * ejecute dos veces, así que el gateway falla cerrado con 400.
 */
export function requerirIdempotencyKey(valor?: string | string[]): string {
  const crudo = Array.isArray(valor) ? valor[0] : valor;
  const key = crudo?.trim();

  if (!key) {
    throw new BadRequestException(
      'Falta el header Idempotency-Key. Generá un UUID por operación y ' +
        'reutilizalo exactamente igual en cada reintento.',
    );
  }
  if (key.length > MAX_LENGTH) {
    throw new BadRequestException(
      `El header Idempotency-Key supera el máximo de ${MAX_LENGTH} caracteres.`,
    );
  }
  return key;
}
