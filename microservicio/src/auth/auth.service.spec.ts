import { RpcException } from '@nestjs/microservices';
import { AuthService } from './auth.service';

const SCRYPT_REGEX = /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/;

function crearPrisma() {
  return {
    app: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
}

function appBase(overrides: Record<string, unknown> = {}) {
  return {
    id_app: 1,
    identificador_app: 'mi-app',
    activo: true,
    key: 'legacy-key',
    app_servicios: [],
    ...overrides,
  };
}

describe('AuthService', () => {
  describe('hashKey / verificarKey', () => {
    it('genera un hash scrypt con salt', async () => {
      const service = new AuthService(crearPrisma() as any);

      const hash = await service.hashKey('mi-key-secreta');

      expect(hash).toMatch(SCRYPT_REGEX);
    });

    it('acepta la key correcta y rechaza la incorrecta', async () => {
      const service = new AuthService(crearPrisma() as any);
      const hash = await service.hashKey('mi-key-secreta');

      await expect(
        (service as any).verificarKey('mi-key-secreta', hash),
      ).resolves.toBe(true);
      await expect(
        (service as any).verificarKey('otra-key', hash),
      ).resolves.toBe(false);
    });

    it('soporta la key legacy en claro', async () => {
      const service = new AuthService(crearPrisma() as any);

      await expect(
        (service as any).verificarKey('legacy-key', 'legacy-key'),
      ).resolves.toBe(true);
      await expect(
        (service as any).verificarKey('otra-key', 'legacy-key'),
      ).resolves.toBe(false);
    });

    it('devuelve false si el hash scrypt está malformado', async () => {
      const service = new AuthService(crearPrisma() as any);

      await expect(
        (service as any).verificarKey('mi-key', 'scrypt$solosalt'),
      ).resolves.toBe(false);
    });
  });

  describe('validarCredencialesApp', () => {
    it('migra la key legacy a scrypt en el primer login válido', async () => {
      const prisma = crearPrisma();
      prisma.app.findUnique.mockResolvedValue(appBase());
      prisma.app.update.mockResolvedValue({});
      const service = new AuthService(prisma as any);

      const resultado = await service.validarCredencialesApp(
        'mi-app',
        'legacy-key',
      );

      expect(resultado).toEqual({
        id_app: 1,
        identificador: 'mi-app',
        permisos: [],
        servicios: [],
      });
      expect(prisma.app.update).toHaveBeenCalledWith({
        where: { id_app: 1 },
        data: { key: expect.stringMatching(SCRYPT_REGEX) },
      });
    });

    it('rechaza credenciales inválidas sin revelar el motivo', async () => {
      const prisma = crearPrisma();
      prisma.app.findUnique.mockResolvedValue(appBase({ key: 'otra' }));
      const service = new AuthService(prisma as any);

      await expect(
        service.validarCredencialesApp('mi-app', 'legacy-key'),
      ).rejects.toMatchObject({
        error: { statusCode: 401, message: 'Credenciales inválidas' },
      });
    });

    it('rechaza una app bloqueada', async () => {
      const prisma = crearPrisma();
      prisma.app.findUnique.mockResolvedValue(appBase({ activo: false }));
      const service = new AuthService(prisma as any);

      await expect(
        service.validarCredencialesApp('mi-app', 'legacy-key'),
      ).rejects.toBeInstanceOf(RpcException);
    });
  });

  describe('obtenerPermisosVigentes', () => {
    it('rechaza la sesión si la app ya no existe o está bloqueada', async () => {
      const prisma = crearPrisma();
      prisma.app.findUnique.mockResolvedValue(null);
      const service = new AuthService(prisma as any);

      await expect(service.obtenerPermisosVigentes(1)).rejects.toBeInstanceOf(
        RpcException,
      );
    });

    it('devuelve los permisos vigentes de la app', async () => {
      const prisma = crearPrisma();
      prisma.app.findUnique.mockResolvedValue(
        appBase({
          app_servicios: [
            {
              servicios: {
                codigo: 'CATALOGO_SRV',
                servicios_controladores: [
                  { controladores: { cmp: 'listar' } },
                ],
              },
            },
          ],
        }),
      );
      const service = new AuthService(prisma as any);

      await expect(service.obtenerPermisosVigentes(1)).resolves.toEqual({
        id_app: 1,
        identificador: 'mi-app',
        permisos: ['listar'],
        servicios: ['CATALOGO_SRV'],
      });
    });
  });
});
