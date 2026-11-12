import { RpcException } from '@nestjs/microservices';
import { RPC_AUTH_KEY, RPC_PAYLOAD_KEY, RpcAuthPipe } from './rpc-auth.pipe';

const SECRETO = 'secreto-de-prueba';

describe('RpcAuthPipe', () => {
  const envOriginal = process.env.MICROSERVICE_SECRET;

  beforeEach(() => {
    process.env.MICROSERVICE_SECRET = SECRETO;
  });

  afterEach(() => {
    if (envOriginal === undefined) {
      delete process.env.MICROSERVICE_SECRET;
    } else {
      process.env.MICROSERVICE_SECRET = envOriginal;
    }
  });

  it('devuelve el payload interno cuando el secreto es correcto', () => {
    const pipe = new RpcAuthPipe();
    const payload = { idApp: 1, datos: 'x' };

    const resultado = pipe.transform({
      [RPC_AUTH_KEY]: SECRETO,
      [RPC_PAYLOAD_KEY]: payload,
    });

    expect(resultado).toBe(payload);
  });

  it('rechaza una llamada sin sobre', () => {
    const pipe = new RpcAuthPipe();

    expect(() => pipe.transform({ idApp: 1 })).toThrow(RpcException);
    expect(() => pipe.transform(1)).toThrow(RpcException);
  });

  it('rechaza un secreto incorrecto', () => {
    const pipe = new RpcAuthPipe();

    expect(() =>
      pipe.transform({
        [RPC_AUTH_KEY]: 'otro-secreto',
        [RPC_PAYLOAD_KEY]: {},
      }),
    ).toThrow(RpcException);
  });

  it('falla cerrado si el microservicio no tiene secreto configurado', () => {
    delete process.env.MICROSERVICE_SECRET;
    const pipe = new RpcAuthPipe();

    try {
      pipe.transform({ [RPC_AUTH_KEY]: SECRETO, [RPC_PAYLOAD_KEY]: {} });
      throw new Error('No debió aceptar la llamada');
    } catch (error) {
      expect(error).toBeInstanceOf(RpcException);
      expect((error as RpcException).getError()).toMatchObject({
        statusCode: 500,
      });
    }
  });
});
