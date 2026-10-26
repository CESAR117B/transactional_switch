import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs'; // <-- Importación moderna de RxJS
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
  // Inyectamos mágicamente el cliente usando el nombre que le dimos en el AppModule
  constructor(
    @Inject('MATH_SERVICE') private readonly mathClient: ClientProxy,
  ) {}

  async get_data(app_id: number) {
    return 'app autenticada con id: ' + app_id;
  }

  async obtenerServiciosPorApp(appId: number) {
    return firstValueFrom(
      this.mathClient.send({ cmd: 'get_servicios' }, appId),
    );
  }

  async guardarTarjeta(idApp: number, cardData: TokenizeCardDto) {
    const payloadInterno = {
      idApp: Number(idApp),
      ...cardData, // Agrega card_number, card_holder, etc.
    };

    return firstValueFrom(
      this.mathClient.send({ cmd: 'save_card' }, payloadInterno),
    );
  }

  /**
   * Alta de una app consumidora. El microservicio genera identificador,
   * key (hash scrypt en BD) y encryptionKey en una transacción, y devuelve
   * las credenciales EN CLARO una sola vez.
   */
  async crearApp(idAppAdmin: number, data: CrearAppDto) {
    const payload = { idApp: Number(idAppAdmin), data };
    return firstValueFrom(this.mathClient.send({ cmd: 'crear_app' }, payload));
  }

  /**
   * Bloquea una app consumidora (activo = false).
   *
   * `idAppAdmin` viaja para auditoría y para que el microservicio impida que
   * una app se bloquee a sí misma. El bloqueo impacta en el próximo login:
   * los JWT ya emitidos siguen vigentes hasta su expiración (1 h).
   */
  async bloquearApp(idAppAdmin: number, data: BloquearAppDto) {
    const payload = { idApp: Number(data.id_app), idAppAdmin: Number(idAppAdmin) };
    return firstValueFrom(
      this.mathClient.send({ cmd: 'bloquear_app' }, payload),
    );
  }

  async listarApps(idAppAdmin: number) {
    // idApp viaja para la auditoría del microservicio (actor de la acción).
    const payload = { idApp: Number(idAppAdmin) };
    return firstValueFrom(
      this.mathClient.send({ cmd: 'listar_apps' }, payload),
    );
  }

  async actualizarApp(idAppAdmin: number, data: UpdateAppDto) {
    const payload = { idApp: Number(idAppAdmin), data };
    return firstValueFrom(
      this.mathClient.send({ cmd: 'actualizar_app' }, payload),
    );
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
   * (idApp === idAppAdmin está prohibido).
   */
  async nuevokeyApp(idAppAdmin: number, idApp: number) {
    const payload = { idAppAdmin: Number(idAppAdmin), idApp: Number(idApp) };
    return firstValueFrom(
      this.mathClient.send({ cmd: 'nuevokey_app' }, payload),
    );
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
   * (idApp === idAppAdmin está prohibido).
   */
  async nuevoencryptionkeyApp(idAppAdmin: number, idApp: number) {
    const payload = { idAppAdmin: Number(idAppAdmin), idApp: Number(idApp) };
    return firstValueFrom(
      this.mathClient.send({ cmd: 'nuevoencryptionkey_app' }, payload),
    );
  }


  async generarPago(idApp: number, data: CrearPagoLoteDto) {
    const payload = { idApp: Number(idApp), data };
    return firstValueFrom(
      this.mathClient.send({ cmd: 'generar_pago' }, payload),
    );
  }

  async generarTransferencia(idApp: number, data: CrearTransferenciaLoteDto) {
    const payload = { idApp: Number(idApp), data };
    return firstValueFrom(
      this.mathClient.send({ cmd: 'generar_transferencia' }, payload),
    );
  }

  async consultarTransacciones(
    idApp: number,
    query: {
      page?: number;
      pageSize?: number;
      status?: number;
      operation?: string;
      fechaDesde?: string;
      fechaHasta?: string;
      cedula?: string;
      cuenta?: string;
    },
    llave: string,
  ): Promise<unknown> {
    const payload = {
      idApp: Number(idApp),
      ...query,
      // EncryptionKey de la app: el microservicio la valida contra BD y la
      // usa para desencriptar la respuesta (llega del header X-Encryption-Key).
      llaveDesencriptacion: llave,
    };
    return firstValueFrom(
      this.mathClient.send<unknown>(
        { cmd: 'consultar_transacciones' },
        payload,
      ),
    );
  }

  async consultarEstadoTransaccion(
    idApp: number,
    dato: string,
    llave: string,
  ): Promise<unknown> {
    const payload = {
      idApp: Number(idApp),
      dato,
      // EncryptionKey de la app: el microservicio la valida contra BD y la
      // usa para desencriptar la respuesta (llega del header X-Encryption-Key).
      llaveDesencriptacion: llave,
    };
    return firstValueFrom(
      this.mathClient.send<unknown>(
        { cmd: 'consultar_estado_transaccion' },
        payload,
      ),
    );
  }

  /**
   * Listado admin de transacciones Produbanco de todas las apps. No envía
   * llave: el microservicio descifra con la encryptionKey de cada app.
   */
  async transaccionesAdmin(
    query: ListarTransaccionesAdminQueryDto,
  ): Promise<unknown> {
    return firstValueFrom(
      this.mathClient.send<unknown>({ cmd: 'transacciones_admin' }, query),
    );
  }

  /**
   * Estado admin de una transacción Produbanco. `idApp` es opcional y, si se
   * envía, acota la búsqueda a esa app (404 si pertenece a otra).
   */
  async estadoTransaccionAdmin(dato: string, idApp?: number): Promise<unknown> {
    const payload = {
      dato,
      ...(idApp !== undefined ? { idApp: Number(idApp) } : {}),
    };
    return firstValueFrom(
      this.mathClient.send<unknown>(
        { cmd: 'estado_transaccion_admin' },
        payload,
      ),
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
   * @param idApp ID de la app administradora que ejecuta la acción.
   * @param codigos Array de códigos de servicio (strings alfanuméricos),
   *   ej: ['PAYMENT', 'REPORT']. Se deduplican internamente.
   * @returns Lista de objetos `{ id_servicio, codigo, nombre }` asignados.
   */
  async asignarServiciosApp(idApp: number, codigos: string[]): Promise<unknown> {
    const payload = { idApp: Number(idApp), codigos };
    return firstValueFrom(
      this.mathClient.send<unknown>({ cmd: 'asignar_servicios_app' }, payload),
    );
  }
}
