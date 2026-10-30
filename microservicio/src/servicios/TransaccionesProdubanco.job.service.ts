import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TramasProdubancoService } from './TramasProdubanco.service';
import { LogProceso } from '../logs/log-proceso.decorator';
import { CronLogResult, CronLogService } from '../logs/cron-log.service';
import { TramaSoap } from '../Integraciones/ProdubancoSoap.service';

/**
 * Estados verbatim de `estado_item` (columna estado_item de
 * transacciones_bancarias_detalle), tomados del Manual §2.3.1 y de
 * PRODUBANCO_DOCUMENTACION.md:
 *
 * `Estado_Proceso` de ConsultaMovimientos, tal cual lo devuelve Produbanco.
 * Nota: Produbanco los envía CON ESPACIO (ej. "PROCESO OK"), no con guion
 * bajo, y el servicio los guarda verbatim en mayúsculas.
 */
export enum JobEstadoItem {
  PENDIENTE = 'PENDIENTE',
  PROCESO_OK = 'PROCESO OK',
  ENTREGADO_OK = 'ENTREGADO OK',
  IMPRESO_OK = 'IMPRESO OK',
  PROCESADAS_ERROR = 'PROCESADAS ERROR',
  REVOCADO = 'REVOCADO',
  REVERSO_OK = 'REVERSO OK',
  PROCESADO = 'PROCESADO',
}

/**
 * Estados verbatim de `estado_servicio` (columna estado_servicio de
 * transacciones_servicios):
 *
 * - `VALIDADO`: lo devuelve la carga (CargaDirectaXml, <Estado>).
 * - `ACTIVO` / `APROBADO` / `PROCESADO` / `REVOCADO`: `Estado_Sobre` de
 *   ConsultaOrdenes.
 *
 * No se mapean: se persiste el valor del banco tal cual.
 */
export enum JobEstadoServicio {
  PENDIENTE = 'PENDIENTE',
  VALIDADO = 'VALIDADO',
  ACTIVO = 'ACTIVO',
  APROBADO = 'APROBADO',
  PROCESADO = 'PROCESADO',
  REVOCADO = 'REVOCADO',
}

/** Nombre con el que se registran las ejecuciones de este cron en `cron_job_logs`. */
const NOMBRE_LOG_CRON = 'Cron-Job-Produbanco';

/** Resultado de una sincronización manual de una transacción. */
export interface JobEjecucionMetadata {
  transaccionId: bigint;
  detalleId: string;
  estadoItemAnterior: string | null;
  estadoServicioAnterior: string | null;
  estadoItemNuevo: string | null;
  estadoServicioNuevo: string | null;
  statusAnterior: number;
  statusNuevo: number;
  motivo: string;
}

@Injectable()
export class TransaccionesProdubancoJobService {
  private readonly logger = new Logger(TransaccionesProdubancoJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tramas: TramasProdubancoService,
    private readonly cronLogService: CronLogService,
  ) {}

  /**
   * Cron job que se ejecuta cada 5 minutos para sincronizar el estado de las
   * transacciones de Produbanco contra el banco (ConsultaOrdenes +
   * ConsultaMovimientos), igual que `estadoTransaccionAdmin`.
   *
   * Los estados resultantes son los definidos en PRODUBANCO_DOCUMENTACION.md:
   * - estado_servicio = Estado_Sobre verbatim (ACTIVO/APROBADO/PROCESADO/REVOCADO)
   * - status: REVOCADO -> ERROR(3), APROBADO/PROCESADO -> PROCESADO_BANCO(2),
   *   ACTIVO conserva el actual
   * - estado_item = Estado_Proceso verbatim por detalle
   */
  @Cron('*/5 * * * *') // Cada 5 minutos
  @LogProceso(NOMBRE_LOG_CRON)
  async manejarCronActualizacionEstado(): Promise<CronLogResult> {
    this.logger.log(
      'Iniciando job de actualización de estados de transacciones Produbanco',
    );

    // Tramas SOAP de todas las transacciones del lote, para auditoría del cron.
    const tramasSoap: TramaSoap[] = [];
    // Los éxitos se agregan en un único registro (el del decorador); los fallos
    // se persisten uno por uno para poder rastrearlos individualmente.
    const exitosas: {
      idTransaccion: bigint;
      estadoSobre: string;
      estadosItem: string[];
    }[] = [];
    let errores = 0;

    try {
      // No tocar transacciones cuya carga normal aún puede estar en curso.
      const hace2Minutos = new Date(Date.now() - 2 * 60 * 1000);

      // Criterio: transacciones de Produbanco con AL MENOS UN detalle en
      // estado_item = 'PENDIENTE'. No se filtra por status de cabecera ni por
      // antigüedad: una carga aceptada deja status=2 (VALIDADO) y un rechazo
      // status=3, pero en ambos casos el detalle puede seguir PENDIENTE y es
      // justamente lo que se debe sincronizar contra el banco.
      const pendientes = await this.prisma.transaccionesServicios.findMany({
        where: {
          operation: { in: TramasProdubancoService.OPERACIONES_PRODUBANCO },
          createdAt: { lte: hace2Minutos },
          detalles: { some: { estadoItem: JobEstadoItem.PENDIENTE } },
        },
        select: { idTransaccion: true },
        take: 100,
        orderBy: { createdAt: 'asc' },
      });

      this.logger.log(
        `Encontradas ${pendientes.length} transacciones Produbanco por sincronizar`,
      );

      if (pendientes.length === 0) {
        this.logger.log('No hay transacciones pendientes para actualizar');
        return {
          exito: true,
          mensaje: 'No hay transacciones pendientes para actualizar',
        };
      }

      let sincronizadas = 0;
      for (const { idTransaccion } of pendientes) {
        try {
          const banco =
            await this.tramas.sincronizarEstadoProdubanco(idTransaccion);
          tramasSoap.push(...(banco?.tramas ?? []));
          if (!banco) {
            errores += 1;
            const motivo = 'no es de Produbanco o no existe';
            this.logger.warn(`Transacción ${idTransaccion} ${motivo}`);
            await this.registrarFalloTransaccion(idTransaccion, motivo, []);
            continue;
          }
          if (!banco.consultado) {
            errores += 1;
            const motivo = `consulta al banco falló (${banco.error ?? 'sin detalle'})`;
            this.logger.warn(`Transacción ${idTransaccion}: ${motivo}`);
            await this.registrarFalloTransaccion(
              idTransaccion,
              motivo,
              banco.tramas ?? [],
            );
            continue;
          }
          sincronizadas += 1;
          // Se registran los valores verbatim que devolvió el SOAP:
          // Estado_Sobre (cabecera) y Estado_Proceso de cada movimiento (ítems).
          const estadosItem = (banco.movimientos ?? [])
            .map((mov) => mov.Estado_Proceso?.trim())
            .filter((estado): estado is string => Boolean(estado));
          exitosas.push({
            idTransaccion,
            estadoSobre: String(
              banco.orden?.Estado_Sobre ?? banco.codigo ?? 'sin dato',
            ),
            estadosItem,
          });
        } catch (error: unknown) {
          // Un error puntual (app sin llave, etc.) no debe detener el lote.
          errores += 1;
          const motivo = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Error sincronizando transacción ${idTransaccion}: ${motivo}`,
          );
          await this.registrarFalloTransaccion(idTransaccion, motivo, []);
        }
      }

      const detalleExitosas = exitosas
        .map(
          ({ idTransaccion, estadoSobre, estadosItem }) =>
            `${idTransaccion} (${estadoSobre}; items=[${
              estadosItem.length > 0
                ? estadosItem.join(', ')
                : 'sin movimientos'
            }])`,
        )
        .join(', ');

      this.logger.log(
        `Finalizó job de actualización de estados. Sincronizadas ${sincronizadas}/${pendientes.length}`,
      );

      const mensaje = `Sincronizadas ${sincronizadas}/${pendientes.length}${
        errores > 0 ? ` (${errores} con error)` : ''
      }${detalleExitosas ? ` | Exitosas: ${detalleExitosas}` : ''}`;

      return {
        exito: errores === 0,
        mensaje,
        ...this.serializarTramas(tramasSoap),
      };
    } catch (error: unknown) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Error en job de actualización de estados de transacciones Produbanco',
        error instanceof Error ? error.stack : String(error),
      );
      // No se relanza: un fallo del job no debe tumbar el proceso.
      return {
        exito: false,
        mensaje,
        ...this.serializarTramas(tramasSoap),
      };
    }
  }

  /**
   * Persiste un registro de fallo independiente para una transacción.
   * Comparte el nombre del cron con el registro resumen y se distingue por
   * `status = 'FALLIDO'` y el prefijo `Transacción <id>` del mensaje; incluye
   * las tramas SOAP de esa transacción cuando están disponibles.
   */
  private async registrarFalloTransaccion(
    idTransaccion: bigint,
    motivo: string,
    tramas: TramaSoap[],
  ): Promise<void> {
    const { request, response } = this.serializarTramas(tramas);
    await this.cronLogService.registrarEjecucion(
      NOMBRE_LOG_CRON,
      false,
      `Transacción ${idTransaccion}: ${motivo}`,
      { request, response },
    );
  }

  /** Separa las tramas acumuladas en request/response para el log del cron. */
  private serializarTramas(tramasSoap: TramaSoap[]): {
    request?: string;
    response?: string;
  } {
    if (tramasSoap.length === 0) return {};
    return {
      request: JSON.stringify(
        tramasSoap.map(({ metodo, request }) => ({ metodo, request })),
      ),
      response: JSON.stringify(
        tramasSoap.map(({ metodo, response }) => ({ metodo, response })),
      ),
    };
  }

  /**
   * Sincroniza manualmente una transacción concreta (consulta en vivo al
   * banco) y devuelve los estados antes/después. Útil para pruebas o para
   * forzar la actualización fuera del horario del cron.
   */
  async actualizarEstadoTransaccionManual(
    idTransaccion: bigint,
  ): Promise<JobEjecucionMetadata> {
    this.logger.log(
      `Actualización manual solicitada para transacción ID=${idTransaccion}`,
    );

    const antes = await this.prisma.transaccionesServicios.findFirst({
      where: {
        idTransaccion,
        operation: { in: TramasProdubancoService.OPERACIONES_PRODUBANCO },
      },
      select: {
        status: true,
        estadoServicio: true,
        detalles: {
          select: { id_detalle: true, estadoItem: true },
          orderBy: { secuencia: 'asc' },
        },
      },
    });

    if (!antes) {
      throw new Error(
        `Transacción de Produbanco con ID ${idTransaccion} no encontrada`,
      );
    }

    const banco = await this.tramas.sincronizarEstadoProdubanco(idTransaccion);

    const despues = await this.prisma.transaccionesServicios.findUnique({
      where: { idTransaccion },
      select: {
        status: true,
        estadoServicio: true,
        detalles: {
          select: { id_detalle: true, estadoItem: true },
          orderBy: { secuencia: 'asc' },
        },
      },
    });

    const detalleAntes = antes.detalles[0];
    const detalleDespues = despues?.detalles[0];

    this.logger.log(
      `Actualización manual completada para transacción ${idTransaccion}: ` +
        `estado_servicio=${despues?.estadoServicio ?? 'null'}, status=${despues?.status ?? antes.status}`,
    );

    return {
      transaccionId: idTransaccion,
      detalleId: detalleAntes?.id_detalle ?? '',
      estadoItemAnterior: detalleAntes?.estadoItem ?? null,
      estadoServicioAnterior: antes.estadoServicio,
      estadoItemNuevo: detalleDespues?.estadoItem ?? null,
      estadoServicioNuevo: despues?.estadoServicio ?? null,
      statusAnterior: antes.status,
      statusNuevo: despues?.status ?? antes.status,
      motivo: banco?.consultado
        ? 'Sincronizado con Produbanco (ConsultaOrdenes + ConsultaMovimientos)'
        : `Consulta al banco falló: ${banco?.error ?? 'sin detalle'}`,
    };
  }
}
