import { UniversalCryptoService } from './universal-crypto.service';

const KEY = '0123456789abcdef0123456789abcdef'; // 32 chars
const OTRA_KEY = 'fedcba9876543210fedcba9876543210';

describe('UniversalCryptoService', () => {
  const service = new UniversalCryptoService();

  it('cifra y descifra un texto (round-trip)', () => {
    const texto = 'token-de-tarjeta-123';

    const paquete = service.encrypt(texto, KEY);

    expect(paquete).not.toContain(texto);
    expect(service.decrypt(paquete, KEY)).toBe(texto);
  });

  it('usa un IV aleatorio en cada cifrado', () => {
    const primero = service.encrypt('mismo texto', KEY);
    const segundo = service.encrypt('mismo texto', KEY);

    expect(primero).not.toBe(segundo);
    expect(service.decrypt(primero, KEY)).toBe('mismo texto');
    expect(service.decrypt(segundo, KEY)).toBe('mismo texto');
  });

  it('falla si el authTag fue alterado', () => {
    const paquete = service.encrypt('texto sensible', KEY);
    const [iv, authTag, cifrado] = paquete.split(':');

    const tag = Buffer.from(authTag, 'base64');
    tag[0] = tag[0] ^ 0xff;
    const paqueteAlterado = `${iv}:${tag.toString('base64')}:${cifrado}`;

    expect(() => service.decrypt(paqueteAlterado, KEY)).toThrow();
  });

  it('falla al descifrar con otra llave', () => {
    const paquete = service.encrypt('texto sensible', KEY);

    expect(() => service.decrypt(paquete, OTRA_KEY)).toThrow();
  });

  it('rechaza llaves que no midan 32 caracteres', () => {
    expect(() => service.encrypt('texto', 'corta')).toThrow(
      /32 caracteres/,
    );
    expect(() => service.decrypt('a:b:c', 'corta')).toThrow(/32 caracteres/);
  });

  it('rechaza un paquete con formato inválido', () => {
    expect(() => service.decrypt('formato-invalido', KEY)).toThrow(
      /Formato de encriptación inválido/,
    );
  });
});
