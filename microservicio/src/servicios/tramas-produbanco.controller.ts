import { Controller, Logger } from '@nestjs/common';
import { TramasProdubancoService } from './tramas-produbanco.service';
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
    const { id_app, data, idempotency_key } = payload;
    if (id_app === undefined || id_app === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'id_app es requerido',
      });
    }
    if (!data) {
      throw new RpcException({
        statusCode: 400,
        message: 'data es requerida para generarPago',
      });
    }
    this.logger.log(
      `generarPago id_app=${id_app} referenciaLote=${data.referencia_lote} registros=${data.detalles?.length ?? 0}`,
    );
    return this.tramasProdubancoService.generarPago(
      id_app,
      data,
      idempotency_key,
    );
  }

  @MessagePattern({ cmd: 'generar_transferencia' })
  async generarTransferencia(
    @Payload() payload: GenerarTransferenciaPayloadDto,
  ) {
    const { id_app, data, idempotency_key } = payload;
    if (id_app === undefined || id_app === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'id_app es requerido',
      });
    }
    if (!data) {
      throw new RpcException({
        statusCode: 400,
        message: 'data es requerida para generarTransferencia',
      });
    }
    this.logger.log(
      `generarTransferencia id_app=${id_app} referenciaLote=${data.referencia_lote} registros=${data.detalles?.length ?? 0}`,
    );
    return this.tramasProdubancoService.generarTransferencia(
      id_app,
      data,
      idempotency_key,
    );
  }

  @MessagePattern({ cmd: 'consultar_transacciones' })
  async consultarTransacciones(@Payload() payload: ConsultarTransaccionesCmd) {
    const { id_app, llave_desencriptacion } = payload ?? {};
    if (id_app === undefined || id_app === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'id_app es requerido',
      });
    }
    if (
      typeof llave_desencriptacion !== 'string' ||
      llave_desencriptacion.trim() === ''
    ) {
      throw new RpcException({
        statusCode: 400,
        message: 'llave_desencriptacion es requerida.',
      });
    }
    this.logger.log(
      `consultarTransacciones id_app=${id_app} page=${payload?.page ?? 1} ` +
        `fechas=${payload?.fecha_desde ?? '*'}..${payload?.fecha_hasta ?? '*'} ` +
        `cedula=${payload?.cedula?.trim() ? 'si' : 'no'} ` +
        `cuenta=${payload?.cuenta?.trim() ? 'si' : 'no'}`,
    );
    return this.tramasProdubancoService.consultarTransacciones(id_app, payload);
  }

  @MessagePattern({ cmd: 'consultar_estado_transaccion' })
  async consultarEstadoTransaccion(@Payload() payload: ConsultarEstadoCmd) {
    const { id_app, dato, llave_desencriptacion } = payload ?? {};
    if (id_app === undefined || id_app === null) {
      throw new RpcException({
        statusCode: 400,
        message: 'id_app es requerido',
      });
    }
    if (dato === undefined || dato === null || String(dato).trim() === '') {
      throw new RpcException({
        statusCode: 400,
        message: 'Se requiere el campo dato (idTransaccion o referenciaLote).',
      });
    }
    if (
      typeof llave_desencriptacion !== 'string' ||
      llave_desencriptacion.trim() === ''
    ) {
      throw new RpcException({
        statusCode: 400,
        message: 'llave_desencriptacion es requerida.',
      });
    }
    this.logger.log(
      `consultarEstadoTransaccion id_app=${id_app} dato=${String(dato)}`,
    );
    return this.tramasProdubancoService.consultarEstadoTransaccion(id_app, {
      dato,
      llave_desencriptacion,
    });
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
      page_size,
      status,
      operation,
      fecha_desde,
      fecha_hasta,
      cedula,
      cuenta,
      id_app,
    } = payload ?? {};

    this.logger.log(
      `transaccionesAdmin id_app=${id_app ?? '*'} page=${page ?? 1} ` +
        `fechas=${fecha_desde ?? '*'}..${fecha_hasta ?? '*'} ` +
        `cedula=${cedula?.trim() ? 'si' : 'no'} ` +
        `cuenta=${cuenta?.trim() ? 'si' : 'no'}`,
    );
    return this.tramasProdubancoService.transaccionesAdmin({
      page,
      page_size,
      status,
      operation,
      fecha_desde,
      fecha_hasta,
      cedula,
      cuenta,
      id_app,
    });
  }

  /**
   * Estado de una transacción Produbanco de CUALQUIER app (solo admin) por
   * un único campo (idTransaccion o referenciaLote). Consulta el banco en
   * vivo y sincroniza la BD, igual que la versión cliente.
   */
  @MessagePattern({ cmd: 'estado_transaccion_admin' })
  async estadoTransaccionAdmin(@Payload() payload: EstadoTransaccionAdminCmd) {
    const { dato, id_app } = payload ?? {};
    if (dato === undefined || dato === null || String(dato).trim() === '') {
      throw new RpcException({
        statusCode: 400,
        message: 'Se requiere el campo dato (idTransaccion o referenciaLote).',
      });
    }

    this.logger.log(
      `estadoTransaccionAdmin id_app=${id_app ?? '*'} dato=${String(dato)}`,
    );
    return this.tramasProdubancoService.estadoTransaccionAdmin({
      dato,
      id_app,
    });
  }
}

interface ConsultarTransaccionesCmd {
  id_app?: number;
  page?: number;
  page_size?: number;
  status?: number;
  operation?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
  cedula?: string;
  cuenta?: string;
  /** EncryptionKey de la app (32 chars), obligatoria: llega vía header
   * X-Encryption-Key en el HTTP y se valida contra app.encryptionKey. */
  llave_desencriptacion?: string;
}

interface ConsultarEstadoCmd {
  id_app?: number;
  dato?: string | number;
  /** EncryptionKey de la app (32 chars), obligatoria: llega vía header
   * X-Encryption-Key en el HTTP y se valida contra app.encryptionKey. */
  llave_desencriptacion?: string;
}

/** Payload RPC del listado admin: todos los filtros son opcionales. */
interface TransaccionesAdminCmd {
  page?: number;
  page_size?: number;
  status?: number;
  operation?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
  /** Requerido si se envía cedula y/o cuenta (hash por llave de la app). */
  cedula?: string;
  cuenta?: string;
  /** Acota el listado a una app; sin valor = todas las apps. */
  id_app?: number;
}

/** Payload RPC del estado admin: `dato` es obligatorio. */
interface EstadoTransaccionAdminCmd {
  dato?: string | number;
  /** Opcional: 404 si la transacción pertenece a otra app. */
  id_app?: number;
}
