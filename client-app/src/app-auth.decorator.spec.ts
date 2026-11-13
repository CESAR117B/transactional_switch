import { BadRequestException } from '@nestjs/common';
import { resolverAppAuth } from './app-auth.decorator';

describe('resolverAppAuth', () => {
  it('devuelve la identidad cuando el guard inyectó id_app', () => {
    const auth = resolverAppAuth({
      appAuth: { id_app: 7, identificador: 'mi-app' },
    });

    expect(auth.id_app).toBe(7);
    expect(auth.identificador).toBe('mi-app');
  });

  it('falla con 400 si no hay appAuth', () => {
    expect(() => resolverAppAuth({})).toThrow(BadRequestException);
  });

  it('falla con 400 si appAuth no trae id_app', () => {
    expect(() => resolverAppAuth({ appAuth: {} })).toThrow(
      'No se pudo identificar la App desde el token',
    );
  });
});
