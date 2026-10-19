import { Logger } from '@nestjs/common';

const logger = new Logger('ThrottlerConfig');

// Resultados ya resueltos por variable: el warning por valor inválido se
// emite UNA sola vez y el .env se consulta al primer uso (nunca al cargar
// el módulo, porque dotenv se ejecuta después de los imports).
const cache = new Map<string, number>();

/**
 * Lee una variable del .env como entero >= 0. Si no existe se usa el
 * default; si existe pero es inválido (texto, decimal, negativo) se avisa
 * en el log y se cae al default: la app NUNCA queda sin límite.
 */
function leerEnteroNoNegativo(nombre: string, defecto: number): number {
  const enCache = cache.get(nombre);
  if (enCache !== undefined) {
    return enCache;
  }

  const crudo = process.env[nombre];
  let valor = defecto;

  if (crudo !== undefined && crudo.trim() !== '') {
    const parseado = Number(crudo);
    if (Number.isInteger(parseado) && parseado >= 0) {
      valor = parseado;
    } else {
      logger.warn(
        `Valor inválido para ${nombre} ("${crudo}"): se espera un número ` +
          `entero >= 0. Se usa el default: ${defecto}.`,
      );
    }
  }

  cache.set(nombre, valor);
  return valor;
}

/** Máximo de peticiones por App autenticada (RATE_LIMIT_APP_MAX, default 10). */
export function rateLimitAppMax(): number {
  return leerEnteroNoNegativo('RATE_LIMIT_APP_MAX', 10);
}

/**
 * Ventana del límite por App autenticada en ms
 * (RATE_LIMIT_APP_VENTANA_SEG, default 60 segundos).
 */
export function rateLimitAppVentanaMs(): number {
  return leerEnteroNoNegativo('RATE_LIMIT_APP_VENTANA_SEG', 60) * 1000;
}

/** Máximo de peticiones por ventana e IP sin autenticar (RATE_LIMIT_IP_MAX, default 100). */
export function rateLimitIpMax(): number {
  return leerEnteroNoNegativo('RATE_LIMIT_IP_MAX', 100);
}

/** Ventana del límite por IP en ms (RATE_LIMIT_IP_VENTANA_SEG, default 60 segundos). */
export function rateLimitIpVentanaMs(): number {
  return leerEnteroNoNegativo('RATE_LIMIT_IP_VENTANA_SEG', 60) * 1000;
}

/** Máximo de intentos de login por minuto e IP (RATE_LIMIT_LOGIN_MAX, default 5). */
export function rateLimitLoginMax(): number {
  return leerEnteroNoNegativo('RATE_LIMIT_LOGIN_MAX', 5);
}
