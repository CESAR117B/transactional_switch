import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { MicroserviceExceptionFilter } from './microservice-exception.filter';

function crearHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { headersSent: false, status };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('MicroserviceExceptionFilter', () => {
  const filtro = new MicroserviceExceptionFilter();

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('mapea un RpcException 409 del microservicio a HTTP 409', () => {
    const { host, status, json } = crearHost();

    filtro.catch(
      {
        statusCode: 409,
        message: 'Ya hay una operación en curso con esta Idempotency-Key.',
        error: 'Conflict',
      },
      host,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        message: 'Ya hay una operación en curso con esta Idempotency-Key.',
        error: 'Conflict',
      }),
    );
  });

  it('mapea un error plano que sólo trae `status` numérico', () => {
    const { host, status, json } = crearHost();

    filtro.catch({ status: 404, message: 'Transacción no encontrada.' }, host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 }),
    );
  });

  it('no expone detalles internos en un 4xx', () => {
    const { host, status, json } = crearHost();

    filtro.catch(
      {
        statusCode: 400,
        message:
          'Fallo https://172.10.18.74/wsdl?wsdl en la IP interna de Produbanco',
      },
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    const cuerpo = json.mock.calls[0][0] as { message: string };
    expect(cuerpo.message).toBe('Solicitud rechazada (HTTP 400)');
  });

  it('un error 5xx del microservicio se responde genérico con correlación', () => {
    const { host, status, json } = crearHost();

    filtro.catch(
      { statusCode: 502, message: 'Timeout hacia webcore.produbanco.ec' },
      host,
    );

    expect(status).toHaveBeenCalledWith(500);
    const cuerpo = json.mock.calls[0][0] as { message: string };
    expect(cuerpo.message).toContain('correlación');
    expect(cuerpo.message).not.toContain('produbanco');
  });

  it('respeta las HttpException con su status original', () => {
    const { host, status, json } = crearHost();

    filtro.catch(new BadRequestException('Dato inválido'), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'Dato inválido' }),
    );
  });
});
