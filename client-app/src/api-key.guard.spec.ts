import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

function crearContexto(headers: Record<string, string> = {}) {
  const request: any = { headers };
  const context: any = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  };
  return { request, context };
}

function crearGuard(
  opciones: {
    publico?: boolean;
    servicio?: string;
    comando?: string;
    verifyAsync?: jest.Mock;
    enviar?: jest.Mock;
  } = {},
) {
  const jwtService = {
    verifyAsync:
      opciones.verifyAsync ??
      jest.fn().mockResolvedValue({ id_app: 1, identificador: 'mi-app' }),
  };
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(opciones.publico ?? false),
    get: jest.fn((clave: string) => {
      if (clave === 'servicio_requerido') return opciones.servicio;
      if (clave === 'comando_requerido') return opciones.comando;
      return undefined;
    }),
  };
  const rpc = {
    enviar:
      opciones.enviar ??
      jest.fn().mockResolvedValue({
        id_app: 1,
        identificador: 'mi-app',
        servicios: [],
        permisos: [],
      }),
  };

  return {
    guard: new ApiKeyGuard(jwtService as any, reflector as any, rpc as any),
    jwtService,
    reflector,
    rpc,
  };
}

describe('ApiKeyGuard', () => {
  it('permite las rutas públicas sin token', async () => {
    const { guard, jwtService } = crearGuard({ publico: true });
    const { context } = crearContexto();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('rechaza si falta el header Authorization', async () => {
    const { guard } = crearGuard();
    const { context } = crearContexto();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza un formato de token inválido', async () => {
    const { guard } = crearGuard();
    const { context } = crearContexto({ authorization: 'Token abc' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('autentica y expone los permisos vigentes en request.appAuth', async () => {
    const { guard, rpc } = crearGuard();
    const { context, request } = crearContexto({
      authorization: 'Bearer token-valido',
    });
    rpc.enviar.mockResolvedValue({
      id_app: 1,
      identificador: 'mi-app',
      servicios: ['SPR_PRODUBANCO'],
      permisos: ['generar_pago'],
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.appAuth).toEqual({
      id_app: 1,
      identificador: 'mi-app',
      servicios: ['SPR_PRODUBANCO'],
      permisos: ['generar_pago'],
    });
    expect(rpc.enviar).toHaveBeenCalledWith(
      { cmd: 'validar_permisos_app' },
      { idApp: 1 },
    );
  });

  it('rechaza si la app no tiene el servicio exigido', async () => {
    const { guard } = crearGuard({ servicio: 'ADMIN_APPS' });
    const { context } = crearContexto({
      authorization: 'Bearer token-valido',
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rechaza si la app no tiene el comando exigido', async () => {
    const { guard } = crearGuard({ comando: 'registrar_app' });
    const { context } = crearContexto({
      authorization: 'Bearer token-valido',
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('propaga el 503 cuando el microservicio no responde (fail-closed)', async () => {
    const { guard } = crearGuard({
      enviar: jest
        .fn()
        .mockRejectedValue(new ServiceUnavailableException('caído')),
    });
    const { context } = crearContexto({
      authorization: 'Bearer token-valido',
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('traduce un 401 del microservicio a sesión no válida', async () => {
    const { guard } = crearGuard({
      enviar: jest.fn().mockRejectedValue({ status: 401, message: 'bloqueada' }),
    });
    const { context } = crearContexto({
      authorization: 'Bearer token-valido',
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza un token corrupto', async () => {
    const error = new Error('jwt malformed');
    error.name = 'JsonWebTokenError';
    const { guard } = crearGuard({
      verifyAsync: jest.fn().mockRejectedValue(error),
    });
    const { context } = crearContexto({
      authorization: 'Bearer token-corrupto',
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
