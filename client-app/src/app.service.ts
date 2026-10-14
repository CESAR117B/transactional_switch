import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs'; // <-- Importación moderna de RxJS
import { TokenizeCardDto } from './dto/tokenize-card.dto';
import {
  CrearPagoLoteDto,
  GenerarPagoPayloadDto,
} from './dto/crear-pago-lote.dto';
import { CrearTransferenciaLoteDto } from './dto/crear-transferencia-lote.dto';

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

  async encrypkeyApp(appId: number) {
    // 1. Armamos el objeto con la propiedad idApp que espera el microservicio
    const payloadInterno = { idApp: Number(appId) };

    // 2. Usamos .send() en lugar de .emit() y retornamos el resultado
    return firstValueFrom(
      this.mathClient.send({ cmd: 'add_app_encryption_key' }, payloadInterno),
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
    query: { page?: number; pageSize?: number; status?: number },
  ): Promise<unknown> {
    const payload = { idApp: Number(idApp), ...query };
    return firstValueFrom(
      this.mathClient.send<unknown>(
        { cmd: 'consultar_transacciones' },
        payload,
      ),
    );
  }

  async consultarEstadoTransaccion(
    idApp: number,
    params: {
      idTransaccion?: string;
      referenciaLote?: string;
      detalleMovimientos?: boolean;
    },
  ): Promise<unknown> {
    const payload = { idApp: Number(idApp), ...params };
    return firstValueFrom(
      this.mathClient.send<unknown>(
        { cmd: 'consultar_estado_transaccion' },
        payload,
      ),
    );
  }
}
