import { createHmac } from 'crypto';

/**
 * Normalización única para búsqueda por cédula/cuenta: quita espacios y
 * guiones y pasa a mayúsculas. Debe usarse TANTO al escribir el hash como
 * al consultar (mismo valor normalizado ⇒ match exacto).
 */
export function normalizarValorBusqueda(valor: string): string {
  return valor.trim().replace(/[\s-]/g, '').toUpperCase();
}

/**
 * Hash determinista de búsqueda: HMAC-SHA256 (hex) con la llave de
 * encriptación de la app sobre el valor normalizado. Se usa HMAC y no un
 * sha256 simple porque cédula y cuenta son de entropy baja: un sha256 simple
 * sería revocable por fuerza bruta con sólo lectura de la BD (patrón como
 * referenceHash/requestHash, pero keyed).
 *
 * @param valor     Valor en claro tal como lo envía el cliente.
 * @param secretKey encryptionKey de la app (32 chars).
 */
export function hashBusqueda(valor: string, secretKey: string): string {
  return createHmac('sha256', secretKey)
    .update(normalizarValorBusqueda(valor), 'utf8')
    .digest('hex');
}
