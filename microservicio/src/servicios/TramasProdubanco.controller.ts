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
    const { idApp } = payload ?? {};
    if (idApp === undefined || idApp === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'idApp es requerido',
      });
    }
    this.logger.log(
      `consultarTransacciones idApp=${idApp} page=${payload?.page ?? 1}`,
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
    const { idApp, idTransaccion, referenciaLote, detalleMovimientos } =
      payload ?? {};
    if (idApp === undefined || idApp === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'idApp es requerido',
      });
    }
    if (!idTransaccion && !referenciaLote) {
      throw new RpcException({
        statusCode: 400,
        message: 'Se requiere idTransaccion o referenciaLote.',
      });
    }
    this.logger.log(
      `consultarEstadoTransaccion idApp=${idApp} id=${idTransaccion ?? '-'} ref=${referenciaLote ?? '-'}`,
    );
    try {
      return await this.tramasProdubancoService.consultarEstadoTransaccion(
        idApp,
        { idTransaccion, referenciaLote, detalleMovimientos },
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
        `Error consultarEstadoTransaccion idApp=${idApp} ref=${referenciaLote ?? '-'}: ${message}`,
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
}

interface ConsultarEstadoCmd {
  idApp?: number;
  idTransaccion?: string | number;
  referenciaLote?: string;
  detalleMovimientos?: boolean;
}
