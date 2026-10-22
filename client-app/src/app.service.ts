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

  async listarApps() {
    return firstValueFrom(
      this.mathClient.send({ cmd: 'listar_apps' }, {}),
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
}
