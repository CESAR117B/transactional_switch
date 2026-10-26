import { Controller, Logger } from '@nestjs/common';
import { TramasProdubancoService } from './TramasProdubanco.service';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { GenerarPagoPayloadDto } from '../dto/crear-pago-lote.dto';
import { GenerarTransferenciaPayloadDto } from '../dto/crear-transferencia-lote.dto';

@Controller()
export class TramasProdubancoController {
  private readonly logger = new Logger(TramasProdubancoController.name);

  constructor(
    private readonly tramasProdubancoService: TramasProdubancoService,
  ) {}

  @MessagePattern({ cmd: 'generar_pago' })
  async generarPago(@Payload() payload: GenerarPagoPayloadDto) {
    const { idApp, data } = payload;
    if (idApp === undefined || idApp === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'idApp es requerido',
      });
    }
    if (!data) {
      throw new RpcException({
        statusCode: 400,
        message: 'data es requerida para generarPago',
      });
    }
    this.logger.log(
      `generarPago idApp=${idApp} referenciaLote=${data.referenciaLote} registros=${data.detalles?.length ?? 0}`,
    );
    try {
      return await this.tramasProdubancoService.generarPago(idApp, data);
    } catch (error: any) {
      if (error instanceof RpcException) throw error;
      // Preserva BadRequest/Rpc del service y transforma resto a RpcException para TCP
      const status = error?.status ?? error?.statusCode ?? 500;
      const message = error?.message ?? 'Error interno en generarPago';
      this.logger.error(
        `Error generarPago idApp=${idApp} ref=${data.referenciaLote}: ${message}`,
        error?.stack,
      );
      throw new RpcException({
        statusCode: status,
        message,
        error: error?.error,
      });
    }
  }

  @MessagePattern({ cmd: 'pago' })
  async generarPagoAlias(@Payload() payload: GenerarPagoPayloadDto) {
    return this.generarPago(payload);
  }

  @MessagePattern({ cmd: 'generar_transferencia' })
  async generarTransferencia(
    @Payload() payload: GenerarTransferenciaPayloadDto,
  ) {
    const { idApp, data } = payload;
    if (idApp === undefined || idApp === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'idApp es requerido',
      });
    }
    if (!data) {
      throw new RpcException({
        statusCode: 400,
        message: 'data es requerida para generarTransferencia',
      });
    }
    this.logger.log(
      `generarTransferencia idApp=${idApp} referenciaLote=${data.referenciaLote} registros=${data.detalles?.length ?? 0}`,
    );
    try {
      return await this.tramasProdubancoService.generarTransferencia(
        idApp,
        data,
      );
    } catch (error: any) {
      if (error instanceof RpcException) throw error;
      const status = error?.status ?? error?.statusCode ?? 500;
      const message = error?.message ?? 'Error interno en generarTransferencia';
      this.logger.error(
        `Error generarTransferencia idApp=${idApp} ref=${data.referenciaLote}: ${message}`,
        error?.stack,
      );
      throw new RpcException({
        statusCode: status,
        message,
        error: error?.error,
      });
    }
  }

  @MessagePattern({ cmd: 'transferencia' })
  async generarTransferenciaAlias(
    @Payload() payload: GenerarTransferenciaPayloadDto,
  ) {
    return this.generarTransferencia(payload);
  }

  @MessagePattern({ cmd: 'consultar_transacciones' })
  async consultarTransacciones(@Payload() payload: ConsultarTransaccionesCmd) {
    const { idApp, llaveDesencriptacion } = payload ?? {};
    if (idApp === undefined || idApp === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'idApp es requerido',
      });
    }
    if (
      typeof llaveDesencriptacion !== 'string' ||
      llaveDesencriptacion.trim() === ''
    ) {
      throw new RpcException({
        statusCode: 400,
        message: 'llaveDesencriptacion es requerida.',
      });
    }
    this.logger.log(
      `consultarTransacciones idApp=${idApp} page=${payload?.page ?? 1} ` +
        `fechas=${payload?.fechaDesde ?? '*'}..${payload?.fechaHasta ?? '*'} ` +
        `cedula=${payload?.cedula?.trim() ? 'si' : 'no'} ` +
        `cuenta=${payload?.cuenta?.trim() ? 'si' : 'no'}`,
    );
    try {
      return await this.tramasProdubancoService.consultarTransacciones(
        idApp,
        payload,
      );
    } catch (error: unknown) {
      if (error instanceof RpcException) throw error;
      const e = error as {
        status?: number;
        statusCode?: number;
        message?: string;
        error?: string;
        stack?: string;
      };
      const status = e?.status ?? e?.statusCode ?? 500;
      const message = e?.message ?? 'Error interno en consultarTransacciones';
      this.logger.error(
        `Error consultarTransacciones idApp=${idApp}: ${message}`,
        e?.stack,
      );
      throw new RpcException({
        statusCode: status,
        message,
        error: e?.error,
      });
    }
  }

  @MessagePattern({ cmd: 'consultar_estado_transaccion' })
  async consultarEstadoTransaccion(@Payload() payload: ConsultarEstadoCmd) {
    const { idApp, dato, llaveDesencriptacion } = payload ?? {};
    if (idApp === undefined || idApp === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'idApp es requerido',
      });
    }
    if (dato === undefined || dato === null || String(dato).trim() === '') {
      throw new RpcException({
        statusCode: 400,
        message: 'Se requiere el campo dato (idTransaccion o referenciaLote).',
      });
    }
    if (
      typeof llaveDesencriptacion !== 'string' ||
      llaveDesencriptacion.trim() === ''
    ) {
      throw new RpcException({
        statusCode: 400,
        message: 'llaveDesencriptacion es requerida.',
      });
    }
    this.logger.log(
      `consultarEstadoTransaccion idApp=${idApp} dato=${String(dato)}`,
    );
    try {
      return await this.tramasProdubancoService.consultarEstadoTransaccion(
        idApp,
        { dato, llaveDesencriptacion },
      );
    } catch (error: unknown) {
      if (error instanceof RpcException) throw error;
      const e = error as {
        status?: number;
        statusCode?: number;
        message?: string;
        error?: string;
        stack?: string;
      };
      const status = e?.status ?? e?.statusCode ?? 500;
      const message =
        e?.message ?? 'Error interno en consultarEstadoTransaccion';
      this.logger.error(
        `Error consultarEstadoTransaccion idApp=${idApp} dato=${String(dato)}: ${message}`,
        e?.stack,
      );
      throw new RpcException({
        statusCode: status,
        message,
        error: e?.error,
      });
    }
  }

  /**
   * Listado de transacciones Produbanco de TODAS las apps (solo admin).
   * No requiere llave: el microservicio descifra con la encryptionKey de
   * cada app leída de BD.
   */
  @MessagePattern({ cmd: 'transacciones_admin' })
  async transaccionesAdmin(@Payload() payload: TransaccionesAdminCmd) {
    const {
      page,
      pageSize,
      status,
      operation,
      fechaDesde,
      fechaHasta,
      cedula,
      cuenta,
      idApp,
    } = payload ?? {};

    this.logger.log(
      `transaccionesAdmin idApp=${idApp ?? '*'} page=${page ?? 1} ` +
        `fechas=${fechaDesde ?? '*'}..${fechaHasta ?? '*'} ` +
        `cedula=${cedula?.trim() ? 'si' : 'no'} ` +
        `cuenta=${cuenta?.trim() ? 'si' : 'no'}`,
    );
    try {
      return await this.tramasProdubancoService.transaccionesAdmin({
        page,
        pageSize,
        status,
        operation,
        fechaDesde,
        fechaHasta,
        cedula,
        cuenta,
        idApp,
      });
    } catch (error: unknown) {
      if (error instanceof RpcException) throw error;
      const e = error as {
        status?: number;
        statusCode?: number;
        message?: string;
        error?: string;
        stack?: string;
      };
      const statusHttp = e?.status ?? e?.statusCode ?? 500;
      const message = e?.message ?? 'Error interno en transaccionesAdmin';
      this.logger.error(
        `Error transaccionesAdmin idApp=${idApp ?? '*'}: ${message}`,
        e?.stack,
      );
      throw new RpcException({
        statusCode: statusHttp,
        message,
        error: e?.error,
      });
    }
  }

  /**
   * Estado de una transacción Produbanco de CUALQUIER app (solo admin) por
   * un único campo (idTransaccion o referenciaLote). Consulta el banco en
   * vivo y sincroniza la BD, igual que la versión cliente.
   */
  @MessagePattern({ cmd: 'estado_transaccion_admin' })
  async estadoTransaccionAdmin(@Payload() payload: EstadoTransaccionAdminCmd) {
    const { dato, idApp } = payload ?? {};
    if (dato === undefined || dato === null || String(dato).trim() === '') {
      throw new RpcException({
        statusCode: 400,
        message: 'Se requiere el campo dato (idTransaccion o referenciaLote).',
      });
    }

    this.logger.log(
      `estadoTransaccionAdmin idApp=${idApp ?? '*'} dato=${String(dato)}`,
    );
    try {
      return await this.tramasProdubancoService.estadoTransaccionAdmin({
        dato,
        idApp,
      });
    } catch (error: unknown) {
      if (error instanceof RpcException) throw error;
      const e = error as {
        status?: number;
        statusCode?: number;
        message?: string;
        error?: string;
        stack?: string;
      };
      const status = e?.status ?? e?.statusCode ?? 500;
      const message = e?.message ?? 'Error interno en estadoTransaccionAdmin';
      this.logger.error(
        `Error estadoTransaccionAdmin idApp=${idApp ?? '*'} dato=${String(dato)}: ${message}`,
        e?.stack,
      );
      throw new RpcException({
        statusCode: status,
        message,
        error: e?.error,
      });
    }
  }
}

interface ConsultarTransaccionesCmd {
  idApp?: number;
  page?: number;
  pageSize?: number;
  status?: number;
  operation?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  cedula?: string;
  cuenta?: string;
  /** EncryptionKey de la app (32 chars), obligatoria: llega vía header
   * X-Encryption-Key en el HTTP y se valida contra app.encryptionKey. */
  llaveDesencriptacion?: string;
}

interface ConsultarEstadoCmd {
  idApp?: number;
  dato?: string | number;
  /** EncryptionKey de la app (32 chars), obligatoria: llega vía header
   * X-Encryption-Key en el HTTP y se valida contra app.encryptionKey. */
  llaveDesencriptacion?: string;
}

/** Payload RPC del listado admin: todos los filtros son opcionales. */
interface TransaccionesAdminCmd {
  page?: number;
  pageSize?: number;
  status?: number;
  operation?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  /** Requerido si se envía cedula y/o cuenta (hash por llave de la app). */
  cedula?: string;
  cuenta?: string;
  /** Acota el listado a una app; sin valor = todas las apps. */
  idApp?: number;
}

/** Payload RPC del estado admin: `dato` es obligatorio. */
interface EstadoTransaccionAdminCmd {
  dato?: string | number;
  /** Opcional: 404 si la transacción pertenece a otra app. */
  idApp?: number;
}
