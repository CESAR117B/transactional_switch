import { Injectable } from '@nestjs/common';
import { MicroserviceRpcService } from './microservice-rpc.service';
import { TokenizeCardDto } from './dto/tokenize-card.dto';
import {
  CrearPagoLoteDto,
  GenerarPagoPayloadDto,
} from './dto/crear-pago-lote.dto';
import { CrearTransferenciaLoteDto } from './dto/crear-transferencia-lote.dto';
import { CrearAppDto } from './dto/crear-app.dto';
import { BloquearAppDto } from './dto/bloquear-app.dto';
import { UpdateAppDto } from './dto/update-app.dto';
import { ListarTransaccionesAdminQueryDto } from './dto/listar-transacciones-admin-query.dto';

@Injectable()
export class AppService {
  // Cliente RPC centralizado: aplica timeout y traduce la pérdida de
  // conexión con el microservicio a una alerta 503.
  constructor(private readonly rpc: MicroserviceRpcService) {}

  async obtenerServiciosPorApp(id_app: number) {
    return this.rpc.enviar({ cmd: 'get_servicios' }, { id_app });
  }

  async guardarTarjeta(id_app: number, cardData: TokenizeCardDto) {
    const payloadInterno = {
      id_app: Number(id_app),
      ...cardData, // Agrega card_number, card_holder, etc.
    };

    return this.rpc.enviar({ cmd: 'save_card' }, payloadInterno);
  }

  /**
   * Alta de una app consumidora. El microservicio genera user_app,
   * key (hash scrypt en BD) y encryptionKey en una transacción, y devuelve
   * las credenciales EN CLARO una sola vez.
   */
  async crearApp(id_app_admin: number, data: CrearAppDto) {
    const payload = { id_app: Number(id_app_admin), data };
    return this.rpc.enviar({ cmd: 'crear_app' }, payload);
  }

  /**
   * Bloquea una app consumidora (activo = false).
   *
   * `id_app_admin` viaja para auditoría y para que el microservicio impida que
   * una app se bloquee a sí misma. El bloqueo aplica de inmediato: el
   * ApiKeyGuard revalida el estado de la app en cada request, además de
   * impedir nuevos logins.
   */
  async bloquearApp(id_app_admin: number, data: BloquearAppDto) {
    const payload = { id_app: Number(data.id_app), id_app_admin: Number(id_app_admin) };
    return this.rpc.enviar({ cmd: 'bloquear_app' }, payload);
  }

  async listarApps(id_app_admin: number) {
    // id_app viaja para la auditoría del microservicio (actor de la acción).
    const payload = { id_app: Number(id_app_admin) };
    return this.rpc.enviar({ cmd: 'listar_apps' }, payload);
  }

  async actualizarApp(
    id_app_admin: number,
    id_app: number,
    data: UpdateAppDto,
  ) {
    const payload = {
      id_app: Number(id_app),
      id_app_admin: Number(id_app_admin),
      data,
    };
    return this.rpc.enviar({ cmd: 'actualizar_app' }, payload);
  }

  /**
   * Genera una nueva key para la app consumidora.
   *
   * La nueva key se entrega en claro UNA sola vez (igual que en el
   * registro inicial). La key hasheada en BD no puede recuperarse.
   * Los servicios de la app deberán actualizar su configuración con
   * la nueva key.
   *
   * Nota: una app no puede generar una nueva key para sí misma
   * (id_app === id_app_admin está prohibido).
   */
  async nuevokeyApp(id_app_admin: number, id_app: number) {
    const payload = { id_app_admin: Number(id_app_admin), id_app: Number(id_app) };
    return this.rpc.enviar({ cmd: 'nuevokey_app' }, payload);
  }

  /**
   * Genera una nueva encryptionKey para la app consumidora.
   *
   * La nueva encryptionKey se entrega en claro UNA sola vez (igual que en el
   * registro inicial). La encryptionKey hasheada en BD no puede recuperarse.
   * Los servicios de la app deberán actualizar su configuración con
   * la nueva encryptionKey.
   *
   * Nota: una app no puede generar una nueva encryptionKey para sí misma
   * (id_app === id_app_admin está prohibido).
   */
  async nuevoencryptionkeyApp(id_app_admin: number, id_app: number) {
    const payload = { id_app_admin: Number(id_app_admin), id_app: Number(id_app) };
    return this.rpc.enviar({ cmd: 'nuevoencryptionkey_app' }, payload);
  }


  async generarPago(
    id_app: number,
    data: CrearPagoLoteDto,
    idempotency_key: string,
  ) {
    const payload = { id_app: Number(id_app), idempotency_key, data };
    return this.rpc.enviar({ cmd: 'generar_pago' }, payload);
  }

  async generarTransferencia(
    id_app: number,
    data: CrearTransferenciaLoteDto,
    idempotency_key: string,
  ) {
    const payload = { id_app: Number(id_app), idempotency_key, data };
    return this.rpc.enviar({ cmd: 'generar_transferencia' }, payload);
  }

  async consultarTransacciones(
    id_app: number,
    query: {
      page?: number;
      page_size?: number;
      status?: number;
      operation?: string;
      fecha_desde?: string;
      fecha_hasta?: string;
      cedula?: string;
      cuenta?: string;
    },
    llave: string,
  ): Promise<unknown> {
    const payload = {
      id_app: Number(id_app),
      ...query,
      // EncryptionKey de la app: el microservicio la valida contra BD y la
      // usa para desencriptar la respuesta (llega del header X-Encryption-Key).
      llave_desencriptacion: llave,
    };
    return this.rpc.enviar<unknown>({ cmd: 'consultar_transacciones' }, payload);
  }

  async consultarEstadoTransaccion(
    id_app: number,
    dato: string,
    llave: string,
  ): Promise<unknown> {
    const payload = {
      id_app: Number(id_app),
      dato,
      // EncryptionKey de la app: el microservicio la valida contra BD y la
      // usa para desencriptar la respuesta (llega del header X-Encryption-Key).
      llave_desencriptacion: llave,
    };
    return this.rpc.enviar<unknown>(
      { cmd: 'consultar_estado_transaccion' },
      payload,
    );
  }

  /**
   * Listado admin de transacciones Produbanco de todas las apps. No envía
   * llave: el microservicio descifra con la encryptionKey de cada app.
   */
  async transaccionesAdmin(
    query: ListarTransaccionesAdminQueryDto,
  ): Promise<unknown> {
    return this.rpc.enviar<unknown>({ cmd: 'transacciones_admin' }, query);
  }

  /**
   * Estado admin de una transacción Produbanco. `id_app` es opcional y, si se
   * envía, acota la búsqueda a esa app (404 si pertenece a otra).
   */
  async estadoTransaccionAdmin(dato: string, id_app?: number): Promise<unknown> {
    const payload = {
      dato,
      ...(id_app !== undefined ? { id_app: Number(id_app) } : {}),
    };
    return this.rpc.enviar<unknown>(
      { cmd: 'estado_transaccion_admin' },
      payload,
    );
  }

  /**
   * Solicita al microservicio que asigne uno o más servicios a una app
   * usando sus códigos alfanuméricos (campo `codigo` de la tabla `servicios`).
   * El microservicio validará que los códigos existan y actualizará la
   * relación `app_servicios`, eliminando asignaciones previas.
   *
   * Emite auditoría con `operation: 'ADMIN_ASIGNAR_SERVICIOS_APP'`.
   *
   * @param id_app ID de la app administradora que ejecuta la acción.
   * @param codigos Array de códigos de servicio (strings alfanuméricos),
   *   ej: ['PAYMENT', 'REPORT']. Se deduplican internamente.
   * @returns Lista de objetos `{ id_servicio, codigo, nombre }` asignados.
   */
  async asignarServiciosApp(
    id_app_admin: number,
    id_app: number,
    codigos: string[],
  ): Promise<unknown> {
    const payload = {
      id_app: Number(id_app),
      id_app_admin: Number(id_app_admin),
      codigos,
    };
    return this.rpc.enviar<unknown>({ cmd: 'asignar_servicios_app' }, payload);
  }

  /**
   * Solicita al microservicio que desasigne uno o más servicios de una app
   * usando sus códigos alfanuméricos. Elimina solo las filas indicadas de
   * `app_servicios`, dejando intactas las demás asignaciones.
   *
   * Emite auditoría con `operation: 'ADMIN_DESASIGNAR_SERVICIOS_APP'`.
   */
  async desasignarServiciosApp(
    id_app_admin: number,
    id_app: number,
    codigos: string[],
  ): Promise<unknown> {
    const payload = {
      id_app: Number(id_app),
      id_app_admin: Number(id_app_admin),
      codigos,
    };
    return this.rpc.enviar<unknown>(
      { cmd: 'desasignar_servicios_app' },
      payload,
    );
  }

  /**
   * Solicita al microservicio activar o desactivar (sin eliminar) la
   * asignación de un servicio para una app. Escribe el campo `activo`
   * del modelo `app_servicios` (relación de la tabla intermedia).
   *
   * `activo = true` activa la asignación; `activo = false` la desactiva.
   * No afecta el interruptor global `servicios.activo`.
   *
   * Emite auditoría con `operation: 'ADMIN_CAMBIAR_ESTADO_SERVICIO_APP'`.
   */
  async cambiarEstadoServicioApp(
    id_app_admin: number,
    id_app: number,
    codigo: string,
    activo: boolean,
  ): Promise<unknown> {
    const payload = {
      id_app: Number(id_app),
      id_app_admin: Number(id_app_admin),
      codigo,
      activo,
    };
    return this.rpc.enviar<unknown>(
      { cmd: 'activar_desactivar_servicio_app' },
      payload,
    );
  }


  async listarServicios() {
    return this.rpc.enviar<unknown>({ cmd: 'listar_servicios' }, {});
  }

  async activarDesactivarServicioGlobal(
    id_app_admin: number,
    id_servicio: number,
  ) {
    return this.rpc.enviar<unknown>(
      { cmd: 'activar_desactivar_servicio' },
      { id_servicio, id_app_admin: Number(id_app_admin) },
    );
  }
}
