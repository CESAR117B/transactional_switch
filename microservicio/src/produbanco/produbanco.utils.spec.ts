import { Prisma } from '@prisma/client';
import { sumarMontos } from './produbanco.utils';

describe('sumarMontos', () => {
  it('evita el error de coma flotante al sumar importes', () => {
    expect(sumarMontos([0.1, 0.2])).toBe(0.3);
    expect(sumarMontos([10.01, 20.02, 30.03])).toBe(60.06);
  });

  it('acepta strings y Decimal de Prisma', () => {
    expect(
      sumarMontos(['100.10', new Prisma.Decimal('200.20'), 300]),
    ).toBe(600.3);
  });

  it('ignora valores vacíos o no numéricos como el reduce anterior', () => {
    expect(sumarMontos([1, null, undefined, '', 'no-numero', 2])).toBe(3);
  });

  it('devuelve 0 para una lista vacía', () => {
    expect(sumarMontos([])).toBe(0);
  });
});
