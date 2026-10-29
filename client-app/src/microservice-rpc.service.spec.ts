import { ServiceUnavailableException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { of, throwError, TimeoutError } from 'rxjs';
import {
  MICROSERVICIO_NO_DISPONIBLE,
  MicroserviceRpcService,
  esErrorDeConexion,
} from './microservice-rpc.service';

function crearServicio(client: Partial<ClientProxy>): MicroserviceRpcService {
  return new MicroserviceRpcService(client as ClientProxy);
}

describe('MicroserviceRpcService', () => {
  const envOriginal = process.env.MICROSERVICE_TIMEOUT_MS;

  afterEach(() => {
    if (envOriginal === undefined) {
      delete process.env.MICROSERVICE_TIMEOUT_MS;
    } else {
      process.env.MICROSERVICE_TIMEOUT_MS = envOriginal;
    }
    jest.restoreAllMocks();
  });

  it('devuelve la respuesta del microservicio cuando hay conexión', async () => {
    const send = jest.fn().mockReturnValue(of({ ok: true }));
    const servicio = crearServicio({ send });

    await expect(
      servicio.enviar({ cmd: 'get_servicios' }, 1),
    ).resolves.toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith({ cmd: 'get_servicios' }, 1);
  });

  it('traduce ECONNREFUSED a una alerta 503 estandarizada', async () => {
    const errorConexion = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
    });
    const servicio = crearServicio({
      send: jest.fn().mockReturnValue(throwError(() => errorConexion)),
    });

    await expect(
      servicio.enviar({ cmd: 'get_servicios' }, 1),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    try {
      await servicio.enviar({ cmd: 'get_servicios' }, 1);
    } catch (error) {
      const respuesta = (error as ServiceUnavailableException).getResponse();
      expect(respuesta).toMatchObject({
        statusCode: 503,
        code: MICROSERVICIO_NO_DISPONIBLE,
      });
    }
  });

  it('traduce un TimeoutError a una alerta 503', async () => {
    const servicio = crearServicio({
      send: jest.fn().mockReturnValue(throwError(() => new TimeoutError())),
    });

    await expect(
      servicio.enviar({ cmd: 'generar_pago' }, {}),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('propaga intactos los errores de negocio del microservicio', async () => {
    const errorNegocio = {
      statusCode: 400,
      message: ['monto debe ser mayor a 0'],
      error: 'Bad Request',
    };
    const servicio = crearServicio({
      send: jest.fn().mockReturnValue(throwError(() => errorNegocio)),
    });

    await expect(
      servicio.enviar({ cmd: 'generar_pago' }, {}),
    ).rejects.toBe(errorNegocio);
  });

  it('verificarConexion devuelve true cuando connect() resuelve', async () => {
    const servicio = crearServicio({
      connect: jest.fn().mockResolvedValue(undefined),
    });

    await expect(servicio.verificarConexion()).resolves.toBe(true);
  });

  it('verificarConexion devuelve false cuando connect() falla', async () => {
    const servicio = crearServicio({
      connect: jest
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('connect ECONNREFUSED'), {
            code: 'ECONNREFUSED',
          }),
        ),
    });

    await expect(servicio.verificarConexion()).resolves.toBe(false);
  });
});

describe('esErrorDeConexion', () => {
  it('detecta errores de red por código', () => {
    expect(
      esErrorDeConexion(
        Object.assign(new Error('fallo'), { code: 'ECONNRESET' }),
      ),
    ).toBe(true);
  });

  it('detecta timeouts de socket', () => {
    expect(
      esErrorDeConexion({ name: 'MessageReceiveTimeoutException' }),
    ).toBe(true);
  });

  it('no marca como conexión un error de negocio', () => {
    expect(
      esErrorDeConexion({
        statusCode: 404,
        message: 'Transacción no encontrada',
      }),
    ).toBe(false);
  });
});
