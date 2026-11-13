import { Client } from 'pg';
import { CronLockService } from './cron-lock.service';

interface ClienteFalso {
  query: jest.Mock;
  end: jest.Mock;
}

function crearClienteFalso(adquirido: boolean): ClienteFalso {
  return {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('pg_try_advisory_lock')) {
        return { rows: [{ ok: adquirido }] };
      }
      return { rows: [] };
    }),
    end: jest.fn(async () => undefined),
  };
}

function crearServicio(cliente: ClienteFalso | null): CronLockService {
  const servicio = new CronLockService();
  // Se reemplaza la conexión real por un cliente falso.
  (servicio as any).obtenerCliente = async () => cliente as Client | null;
  return servicio;
}

describe('CronLockService', () => {
  it('ejecuta la tarea y libera el lock cuando lo adquiere', async () => {
    const cliente = crearClienteFalso(true);
    const servicio = crearServicio(cliente);
    const tarea = jest.fn(async () => 'ok');

    await expect(servicio.conLock(123, tarea)).resolves.toEqual({
      adquirido: true,
      resultado: 'ok',
    });
    expect(tarea).toHaveBeenCalledTimes(1);
    expect(cliente.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_unlock($1)',
      [123],
    );
  });

  it('no ejecuta la tarea si otra instancia tiene el lock', async () => {
    const cliente = crearClienteFalso(false);
    const servicio = crearServicio(cliente);
    const tarea = jest.fn(async () => 'ok');

    await expect(servicio.conLock(123, tarea)).resolves.toEqual({
      adquirido: false,
    });
    expect(tarea).not.toHaveBeenCalled();
    // No se intenta liberar un lock que no se adquirió.
    expect(cliente.query).not.toHaveBeenCalledWith(
      'SELECT pg_advisory_unlock($1)',
      [123],
    );
  });

  it('libera el lock y propaga el error si la tarea falla', async () => {
    const cliente = crearClienteFalso(true);
    const servicio = crearServicio(cliente);

    await expect(
      servicio.conLock(123, async () => {
        throw new Error('falló');
      }),
    ).rejects.toThrow('falló');
    expect(cliente.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_unlock($1)',
      [123],
    );
  });

  it('no ejecuta nada si no hay conexión disponible', async () => {
    const servicio = crearServicio(null);
    const tarea = jest.fn(async () => 'ok');

    await expect(servicio.conLock(123, tarea)).resolves.toEqual({
      adquirido: false,
    });
    expect(tarea).not.toHaveBeenCalled();
  });
});
