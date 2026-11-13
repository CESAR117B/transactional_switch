import { RpcException } from '@nestjs/microservices';
import { TramasProdubancoService } from './tramas-produbanco.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProdubancoSoapService } from '../integraciones/produbanco-soap.service';
import { UniversalCryptoService } from './universal-crypto.service';
import { ConfigDbService } from '../config-db/config-db.service';
import { LotesRepository } from '../produbanco/lotes.repository';
import { EstadoTransaccion } from '../produbanco/produbanco.types';
import {
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
      referenciaLote: 'ref-cifrada',
      montoTotal: 13.75,
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
    ).resolves.toEqual({ referenciaLote: 'ref-cifrada', montoTotal: 5 });
  });

  it('el hash de contenido ignora la referencia del lote', () => {
    const base = {
      servicio: 'PV',
      idServicio: '75',
      detalles: [{ monto: 1 }],
    };

    expect(hashContenidoLote({ ...base, referenciaLote: 'A' } as any)).toBe(
      hashContenidoLote({ ...base, referenciaLote: 'B' } as any),
    );
  });
});
