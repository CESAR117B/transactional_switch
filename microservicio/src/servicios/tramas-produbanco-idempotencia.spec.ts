import { RpcException } from '@nestjs/microservices';
import { TramasProdubancoService } from './tramas-produbanco.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProdubancoSoapService } from '../integraciones/produbanco-soap.service';
import { UniversalCryptoService } from './universal-crypto.service';
import { ConfigDbService } from '../config-db/config-db.service';
import { LotesRepository } from '../produbanco/lotes.repository';
import { EstadoTransaccion } from '../produbanco/produbanco.types';
import {
  clasificarErrorCarga,
  hashContenidoLote,
  normalizarIdempotencyKey,
} from '../produbanco/produbanco.utils';
import { ConsultaTransaccionesService } from '../produbanco/consulta-transacciones.service';
import { TramaBuilderService } from '../produbanco/trama-builder.service';

function crearRepo(): LotesRepository {
  return new LotesRepository(
    {} as PrismaService,
    new UniversalCryptoService(),
  );
}

function crearOrquestador(repo: LotesRepository): TramasProdubancoService {
  return new TramasProdubancoService(
    {} as ProdubancoSoapService,
    {} as ConfigDbService,
    repo,
    {} as TramaBuilderService,
    {
      consultarBanco: jest.fn(),
    } as unknown as ConsultaTransaccionesService,
  );
}

describe('idempotencia de lotes', () => {
  it('rechaza una Idempotency-Key ausente con 400', () => {
    try {
      normalizarIdempotencyKey('   ');
      throw new Error('debió lanzar');
    } catch (error) {
      expect(error).toBeInstanceOf(RpcException);
      expect((error as RpcException).getError()).toMatchObject({
        statusCode: 400,
      });
    }
  });

  it('normaliza la Idempotency-Key quitando espacios', () => {
    expect(normalizarIdempotencyKey('  abc-123  ')).toBe('abc-123');
  });

  it('reconstruye la respuesta original desde la transacción persistida', () => {
    const respuesta = crearRepo().respuestaDeTransaccion({
      reference: 'ref-cifrada',
      requestPayload: {
        detalles: [{ monto: 10.5 }, { monto: 2 }, { monto: '1.25' }],
      },
    } as any);

    expect(respuesta).toEqual({
      referencia_lote: 'ref-cifrada',
      monto_total: 13.75,
    });
  });

  it('un reintento sobre una transacción ya procesada devuelve la misma respuesta sin consultar al banco', async () => {
    const repo = crearRepo();
    const servicio = crearOrquestador(repo);

    await expect(
      (servicio as any).resolverReintento(
        {
          status: EstadoTransaccion.PROCESADO_BANCO,
          reference: 'ref-cifrada',
          requestPayload: { detalles: [{ monto: 5 }] },
        },
        1,
      ),
    ).resolves.toEqual({ referencia_lote: 'ref-cifrada', monto_total: 5 });
  });

  it('el hash de contenido ignora la referencia del lote', () => {
    const base = {
      servicio: 'PV',
      idServicio: '75',
      detalles: [{ monto: 1 }],
    };

    expect(hashContenidoLote({ ...base, referencia_lote: 'A' } as any)).toBe(
      hashContenidoLote({ ...base, referencia_lote: 'B' } as any),
    );
  });

  it('clasifica un rechazo con respuesta del banco como definitivo', () => {
    expect(
      clasificarErrorCarga({
        message: 'Produbanco no registró la carga',
        respuestaBanco: '<Resultado/>',
      }),
    ).toBe('definitivo');
  });

  it('clasifica un timeout o error de red como incierto', () => {
    expect(
      clasificarErrorCarga({
        message: 'Timeout de 20000ms esperando CargaDirectaXml de Produbanco.',
      }),
    ).toBe('incierto');
    expect(
      clasificarErrorCarga({ message: 'connect ETIMEDOUT 1.2.3.4:443' }),
    ).toBe('incierto');
  });

  it('un reintento INCIERTO sin confirmación del banco no pide llave nueva', async () => {
    const repo = crearRepo();
    repo.getEncryptionKey = jest.fn().mockResolvedValue('k'.repeat(32));
    const consulta = {
      consultarBanco: jest.fn().mockResolvedValue({ consultado: true }),
    };
    const servicio = new TramasProdubancoService(
      {} as ProdubancoSoapService,
      {} as ConfigDbService,
      repo,
      {} as TramaBuilderService,
      consulta as unknown as ConsultaTransaccionesService,
    );

    await expect(
      (servicio as any).resolverReintento(
        {
          status: EstadoTransaccion.INCIERTO,
          reference: 'ref',
          responsePayload: {},
          errorMessage: 'Timeout',
        },
        1,
      ),
    ).rejects.toBeInstanceOf(RpcException);

    try {
      await (servicio as any).resolverReintento(
        {
          status: EstadoTransaccion.INCIERTO,
          reference: 'ref',
          responsePayload: {},
          errorMessage: 'Timeout',
        },
        1,
      );
    } catch (error) {
      const mensaje = (error as RpcException).getError() as {
        message: string;
      };
      expect(mensaje.message).toContain('NO generes una llave nueva');
      expect(consulta.consultarBanco).toHaveBeenCalled();
    }
  });

  it('un ERROR definitivo sí permite reintentar con llave nueva', async () => {
    const repo = crearRepo();
    const servicio = crearOrquestador(repo);

    try {
      await (servicio as any).resolverReintento(
        {
          status: EstadoTransaccion.ERROR,
          reference: 'ref',
          responsePayload: { rechazoDefinitivo: true },
          errorMessage: 'Trama inválida',
        },
        1,
      );
      throw new Error('debió lanzar');
    } catch (error) {
      const mensaje = (error as RpcException).getError() as {
        message: string;
      };
      expect(mensaje.message).toContain('Idempotency-Key nueva');
    }
  });

  it('un ERROR legacy (sin marca de definitivo) se reconcilia y no habilita llave nueva', async () => {
    const repo = crearRepo();
    repo.getEncryptionKey = jest.fn().mockResolvedValue('k'.repeat(32));
    const consulta = {
      consultarBanco: jest.fn().mockResolvedValue({ consultado: true }),
    };
    const servicio = new TramasProdubancoService(
      {} as ProdubancoSoapService,
      {} as ConfigDbService,
      repo,
      {} as TramaBuilderService,
      consulta as unknown as ConsultaTransaccionesService,
    );

    try {
      await (servicio as any).resolverReintento(
        {
          status: EstadoTransaccion.ERROR,
          reference: 'ref',
          responsePayload: {},
          errorMessage: 'Timeout viejo',
        },
        1,
      );
      throw new Error('debió lanzar');
    } catch (error) {
      expect(consulta.consultarBanco).toHaveBeenCalled();
      const mensaje = (error as RpcException).getError() as {
        message: string;
      };
      expect(mensaje.message).toContain('NO generes una llave nueva');
    }
  });

  it('rechaza con 422 la misma llave usada con otro contenido', () => {
    const servicio = crearOrquestador(crearRepo());

    expect(() =>
      (servicio as any).validarContenidoReintento(
        { requestHash: 'hash-a' },
        'hash-b',
      ),
    ).toThrow(RpcException);
  });
});

