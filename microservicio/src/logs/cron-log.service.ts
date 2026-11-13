import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Datos opcionales que se persisten al cerrar un log de cron. */
export interface CronLogExtra {
  /** XML/argumentos enviados a servicios externos (ej. SOAP). */
  request?: string;
  /** Respuesta cruda de servicios externos (ej. SOAP). */
  response?: string;
}

/**
 * Resultado que puede devolver un método decorado con `@LogProceso` para
 * controlar cómo se registra el cierre del cron.
 */
export interface CronLogResult {
  exito?: boolean;
  mensaje?: string;
  request?: string;
  response?: string;
}

@Injectable()
export class CronLogService {
  private readonly logger = new Logger(CronLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  // 1. Iniciar Log
  async startLog(nombreProceso: string): Promise<number> {
    try {
      const log = await this.prisma.cron_job_logs.create({
        data: {
          cron_job: nombreProceso,
          status: 'EJECUTANDO',
          fecha_inicio: new Date(),
        },
      });
      return log.id_log;
    } catch (error) {
      this.logger.error(
        `Error al crear log de inicio para ${nombreProceso}`,
        error,
      );
      return 0; // Retornamos 0 para no romper el proceso principal si falla el log
    }
  }

  /**
   * Registra una ejecución ya finalizada en un único INSERT, sin pasar por
   * `startLog`/`endLog`. Útil para fallos puntuales que deben quedar como
   * registros independientes dentro de un proceso mayor.
   */
  async registrarEjecucion(
    nombreProceso: string,
    exito: boolean,
    mensaje: string = '',
    extra?: CronLogExtra,
  ): Promise<void> {
    try {
      const ahora = new Date();
      await this.prisma.cron_job_logs.create({
        data: {
          cron_job: nombreProceso,
          status: exito ? 'EXITO' : 'FALLIDO',
          mensaje: mensaje || null,
          fecha_inicio: ahora,
          fecha_fin: ahora,
          duracion: 0,
          ...(extra?.request ? { request: extra.request } : {}),
          ...(extra?.response ? { response: extra.response } : {}),
        },
      });
    } catch (error) {
      this.logger.error(
        `Error al registrar ejecución de ${nombreProceso}`,
        error,
      );
    }
  }

  // 2. Finalizar Log (Éxito o Error)
  async endLog(
    idLog: number,
    exito: boolean,
    mensaje: string = '',
    extra?: CronLogExtra,
  ): Promise<void> {
    if (idLog === 0) return; // Si no se creó el log inicial, no hacemos nada

    try {
      const fin = new Date();

      // Obtenemos el inicio para calcular duración
      const logInicial = await this.prisma.cron_job_logs.findUnique({
        where: { id_log: idLog },
        select: { fecha_inicio: true },
      });

      const inicio = logInicial?.fecha_inicio
        ? new Date(logInicial.fecha_inicio)
        : fin;
      const duracion = Math.round((fin.getTime() - inicio.getTime()) / 1000);

      await this.prisma.cron_job_logs.update({
        where: { id_log: idLog },
        data: {
          fecha_fin: fin,
          duracion,
          status: exito ? 'EXITO' : 'FALLIDO',
          mensaje: mensaje || null,
          ...(extra?.request ? { request: extra.request } : {}),
          ...(extra?.response ? { response: extra.response } : {}),
        },
      });
    } catch (error) {
      this.logger.error(`Error al cerrar log ID ${idLog}`, error);
    }
  }
}
