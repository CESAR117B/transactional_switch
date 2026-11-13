import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { RpcExceptionFilter } from './rpc-exception.filter';

describe('RpcExceptionFilter', () => {
  const filtro = new RpcExceptionFilter();
  const host = {} as ArgumentsHost;

  /** Ejecuta el filtro y devuelve el cuerpo que viajaría por TCP. */
  function cuerpoDe(exception: unknown): unknown {
    let cuerpo: unknown;
    filtro.catch(exception, host).subscribe({
      error: (error: unknown) => {
        cuerpo = error;
      },
    });
    return cuerpo;
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normaliza un RpcException con `status` a `statusCode`', () => {
    const cuerpo = cuerpoDe(
      new RpcException({ status: 401, message: 'Credenciales inválidas' }),
    );

    expect(cuerpo).toEqual({
      statusCode: 401,
      message: 'Credenciales inválidas',
      error: 'Unauthorized',
    });
  });

  it('respeta un RpcException que ya trae statusCode y error', () => {
    const cuerpo = cuerpoDe(
      new RpcException({
        statusCode: 409,
        message: 'En curso',
        error: 'Conflict',
      }),
    );

    expect(cuerpo).toEqual({
      statusCode: 409,
      message: 'En curso',
      error: 'Conflict',
    });
  });

  it('traduce una HttpException al mismo status en lugar de 500', () => {
    const cuerpo = cuerpoDe(new BadRequestException('Dato inválido'));

    expect(cuerpo).toEqual(
      expect.objectContaining({
        statusCode: 400,
        error: 'Bad Request',
      }),
    );
  });

  it('un Error inesperado se responde 500 sin filtrar el mensaje interno', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const cuerpo = cuerpoDe(new Error('WSDL https://172.10.18.74 roto'));

    expect(cuerpo).toEqual({
      statusCode: 500,
      message: 'Error interno del servidor',
      error: 'Internal Server Error',
    });
  });
});
