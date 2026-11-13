import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Client } from 'pg';
import { config as loadEnv } from 'dotenv';

loadEnv();

/**
 * Clave del advisory lock del cron de Produbanco. Cualquier instancia que
 * use la misma clave (y la misma BD) no podrá ejecutar el cron a la vez.
 */
export const CRON_LOCK_PRODUBANCO = 0x50524f44; // "PROD"

export interface ResultadoConLock<T> {
  /** false si otra instancia (o sesión) ya tiene el lock. */
  adquirido: boolean;
  resultado?: T;
}

/**
 * Lock multi-instancia del cron basado en advisory locks de PostgreSQL.
 *
 * `pg_try_advisory_lock` es por SESIÓN: por eso se usa un `pg.Client`
 * dedicado (no el pool de Prisma, que podría dar otra conexión al liberar).
 * El cliente se mantiene abierto entre corridas y el lock se libera en el
 * `finally`; si la conexión se cae, PostgreSQL libera los locks de esa
 * sesión automáticamente.
 */
@Injectable()
export class CronLockService implements OnModuleDestroy {
  private readonly logger = new Logger(CronLockService.name);
  private cliente: Client | null = null;

  /**
   * Ejecuta `tarea` sólo si se adquiere el lock. Devuelve `adquirido: false`
   * sin ejecutar nada si otra instancia lo tiene o si no hay conexión.
   */
  async conLock<T>(
    clave: number,
    tarea: () => Promise<T>,
  ): Promise<ResultadoConLock<T>> {
    const cliente = await this.obtenerCliente();
    if (!cliente) return { adquirido: false };

    let adquirido = false;
    try {
      const { rows } = await cliente.query<{ ok: boolean }>(
        'SELECT pg_try_advisory_lock($1) AS ok',
        [clave],
      );
      adquirido = rows[0]?.ok === true;
      if (!adquirido) {
        this.logger.warn(
          'No se adquirió el advisory lock: otra instancia está ejecutando el cron',
        );
        return { adquirido: false };
      }
      const resultado = await tarea();
      return { adquirido: true, resultado };
    } catch (error: unknown) {
      // Un fallo de conexión invalida el cliente dedicado; se reabrirá en
      // la próxima corrida. Se propaga para que el job registre el error.
      this.logger.error(
        `Error con el advisory lock: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await this.descartarCliente();
      throw error;
    } finally {
      if (adquirido) {
        try {
          await cliente.query('SELECT pg_advisory_unlock($1)', [clave]);
        } catch (error: unknown) {
          this.logger.warn(
            `No se pudo liberar el advisory lock: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          await this.descartarCliente();
        }
      }
    }
  }

  private async obtenerCliente(): Promise<Client | null> {
    if (this.cliente) return this.cliente;

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      this.logger.error(
        'DATABASE_URL no está definida: no se puede adquirir el lock del cron',
      );
      return null;
    }

    const cliente = new Client({ connectionString });
    try {
      await cliente.connect();
      this.cliente = cliente;
      return cliente;
    } catch (error: unknown) {
      this.logger.error(
        `No se pudo conectar para el advisory lock: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      try {
        await cliente.end();
      } catch {
        // La conexión ya falló; nada que cerrar.
      }
      return null;
    }
  }

  /** Cierra el cliente dedicado (libera implícitamente sus locks). */
  private async descartarCliente(): Promise<void> {
    const cliente = this.cliente;
    this.cliente = null;
    if (!cliente) return;
    try {
      await cliente.end();
    } catch {
      // Ignorar errores al cerrar una conexión ya rota.
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.descartarCliente();
  }
}
