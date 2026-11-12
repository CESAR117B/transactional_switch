import { hashBusqueda, normalizarValorBusqueda } from './hash-busqueda';

const KEY = '0123456789abcdef0123456789abcdef';
const OTRA_KEY = 'fedcba9876543210fedcba9876543210';

describe('normalizarValorBusqueda', () => {
  it('quita espacios y guiones, y pasa a mayúsculas', () => {
    expect(normalizarValorBusqueda(' 171-234 5678 ')).toBe('1712345678');
    expect(normalizarValorBusqueda('abc-def')).toBe('ABCDEF');
  });
});

describe('hashBusqueda', () => {
  it('es determinista para el mismo valor normalizado y llave', () => {
    const a = hashBusqueda('1712345678', KEY);
    const b = hashBusqueda('1712345678', KEY);

    expect(a).toBe(b);
  });

  it('trata como iguales los valores que sólo difieren en espacios, guiones o mayúsculas', () => {
    expect(hashBusqueda('171-234 5678', KEY)).toBe(
      hashBusqueda('1712345678', KEY),
    );
  });

  it('produce hashes distintos para llaves distintas', () => {
    expect(hashBusqueda('1712345678', KEY)).not.toBe(
      hashBusqueda('1712345678', OTRA_KEY),
    );
  });

  it('produce hashes distintos para valores distintos', () => {
    expect(hashBusqueda('1712345678', KEY)).not.toBe(
      hashBusqueda('1712345679', KEY),
    );
  });

  it('devuelve un HMAC-SHA256 en hex (64 caracteres)', () => {
    expect(hashBusqueda('1712345678', KEY)).toMatch(/^[0-9a-f]{64}$/);
  });
});
