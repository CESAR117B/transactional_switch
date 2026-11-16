import { of, throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import { FirstokenService } from './firstoken.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigDbService } from '../config-db/config-db.service';
import { UniversalCryptoService } from '../servicios/universal-crypto.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { HttpService } from '@nestjs/axios';

const TARJETA = {
  card_number: '4111111111111111',
  card_holder: 'TITULAR PRUEBA',
  card_month: '12',
  card_year: '2030',
  card_cvv: '123',
  temporal: false,
  idempotencyKey: 'idem-token-1',
};

const RESPUESTA_PROVEEDOR = {
  status: 201,
  data: {
    card_holder: 'TITULAR PRUEBA',
    card_month: '12',
    card_year: '2030',
    custom_field_details: {
      card: {
        token: 'token-proveedor',
        card_truncated: '411111******1111',
        brand: 'visa',
        last_four: '1111',
        bin: '411111',
      },
    },
  },
};

function configMock() {
  return {
    getFirstTokenConfig: jest.fn().mockResolvedValue({
      base_url: 'https://firstoken.test',
      routes: { permanent_card: 'permanent', temporal_card: 'temporal' },
      timeout: 1000,
    }),
  };
}

function prismaMock(overrides: Record<string, unknown> = {}) {
  return {
    tokenizedCard: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    app: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ encryptionKey: 'k'.repeat(32) }),
    },
    ...overrides,
  };
}

function crearServicio(
  prisma: ReturnType<typeof prismaMock>,
  http: { post: jest.Mock },
) {
  return new FirstokenService(
    http as unknown as HttpService,
    configMock() as unknown as ConfigDbService,
    prisma as unknown as PrismaService,
    { emit: jest.fn() } as unknown as EventEmitter2,
    {
      encrypt: jest.fn().mockReturnValue('token-cifrado'),
    } as unknown as UniversalCryptoService,
  );
}

describe('idempotencia de tokenización', () => {
  it('reserva la fila PENDING antes de llamar a Firstoken y la completa a ACTIVE', async () => {
    const prisma = prismaMock();
    const orden: string[] = [];

    prisma.tokenizedCard.create.mockImplementation(() => {
      orden.push('create');
      return Promise.resolve({
        idCard: 10n,
        updatedAt: new Date(),
        status: 'PENDING',
        firstToken: '',
      });
    });
    prisma.tokenizedCard.update.mockImplementation(() => {
      orden.push('update');
      return Promise.resolve({ idCard: 10n });
    });

    const http = {
      post: jest.fn().mockImplementation(() => {
        orden.push('post');
        return of(RESPUESTA_PROVEEDOR);
      }),
    };

    const servicio = crearServicio(prisma, http);
    const resultado = await servicio.permanentTokenCard(1, TARJETA);

    expect(orden).toEqual(['create', 'post', 'update']);
    expect(prisma.tokenizedCard.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: 'idem-token-1',
          status: 'PENDING',
          firstToken: '',
        }),
      }),
    );
    expect(prisma.tokenizedCard.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ACTIVE',
          firstToken: 'token-cifrado',
        }),
      }),
    );
    expect(resultado.token).toBe('token-cifrado');
  });

  it('un reintento sobre una tarjeta ACTIVE no llama al proveedor', async () => {
    const prisma = prismaMock();
    prisma.tokenizedCard.findUnique.mockResolvedValue({
      idCard: 11n,
      status: 'ACTIVE',
      firstToken: 'token-cifrado',
      cardTruncated: '411111******1111',
      franchise: 'VISA',
      holderName: 'TITULAR PRUEBA',
      expirationMonth: '12',
      expirationYear: '2030',
      lastFour: '1111',
      typeCard: 'PERMANENT',
      metadata: {},
    });
    const http = { post: jest.fn() };

    const servicio = crearServicio(prisma, http);
    const resultado = await servicio.permanentTokenCard(1, TARJETA);

    expect(http.post).not.toHaveBeenCalled();
    expect(resultado.token).toBe('token-cifrado');
  });

  it('si el proveedor falla, libera la reserva para permitir reintento', async () => {
    const prisma = prismaMock();
    prisma.tokenizedCard.create.mockResolvedValue({
      idCard: 12n,
      updatedAt: new Date(),
      status: 'PENDING',
      firstToken: '',
    });
    const http = {
      post: jest
        .fn()
        .mockReturnValue(
          throwError(() => ({ message: 'boom', response: { status: 500 } })),
        ),
    };

    const servicio = crearServicio(prisma, http);

    await expect(servicio.permanentTokenCard(1, TARJETA)).rejects.toBeInstanceOf(
      RpcException,
    );
    expect(prisma.tokenizedCard.deleteMany).toHaveBeenCalledWith({
      where: { idCard: 12n, status: 'PENDING' },
    });
  });

  it('una reserva PENDING reciente responde 409 sin llamar al proveedor', async () => {
    const prisma = prismaMock();
    prisma.tokenizedCard.findUnique.mockResolvedValue({
      idCard: 13n,
      status: 'PENDING',
      firstToken: '',
      updatedAt: new Date(),
      metadata: {},
    });
    const http = { post: jest.fn() };

    const servicio = crearServicio(prisma, http);

    try {
      await servicio.permanentTokenCard(1, TARJETA);
      throw new Error('debió lanzar');
    } catch (error) {
      expect(error).toBeInstanceOf(RpcException);
      expect((error as RpcException).getError()).toMatchObject({
        statusCode: 409,
      });
    }
    expect(http.post).not.toHaveBeenCalled();
  });

  it('una tarjeta legacy PENDING con token se devuelve y se marca ACTIVE', async () => {
    const prisma = prismaMock();
    prisma.tokenizedCard.findUnique.mockResolvedValue({
      idCard: 14n,
      status: 'PENDING',
      firstToken: 'token-viejo',
      cardTruncated: '411111******1111',
      franchise: 'VISA',
      holderName: 'TITULAR PRUEBA',
      expirationMonth: '12',
      expirationYear: '2030',
      lastFour: '1111',
      typeCard: 'TEMPORAL',
      metadata: { bin: '411111' },
    });
    const http = { post: jest.fn() };

    const servicio = crearServicio(prisma, http);
    const resultado = await servicio.temporalTokenCard(1, TARJETA);

    expect(http.post).not.toHaveBeenCalled();
    expect(prisma.tokenizedCard.update).toHaveBeenCalledWith({
      where: { idCard: 14n },
      data: { status: 'ACTIVE' },
    });
    expect(resultado.token).toBe('token-viejo');
  });

  it('rechaza con 422 la misma llave usada con otra tarjeta', async () => {
    const prisma = prismaMock();
    prisma.tokenizedCard.findUnique.mockResolvedValue({
      idCard: 15n,
      status: 'ACTIVE',
      firstToken: 'token-cifrado',
      cardTruncated: '411111******1111',
      franchise: 'VISA',
      holderName: 'TITULAR PRUEBA',
      expirationMonth: '12',
      expirationYear: '2030',
      lastFour: '1111',
      typeCard: 'PERMANENT',
      metadata: { requestHash: 'otro-hash' },
    });
    const http = { post: jest.fn() };

    const servicio = crearServicio(prisma, http);

    try {
      await servicio.permanentTokenCard(1, TARJETA);
      throw new Error('debió lanzar');
    } catch (error) {
      expect(error).toBeInstanceOf(RpcException);
      expect((error as RpcException).getError()).toMatchObject({
        statusCode: 422,
      });
    }
  });
});
