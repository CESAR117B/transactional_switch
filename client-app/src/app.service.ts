import { Injectable, Inject } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { firstValueFrom } from "rxjs"; // <-- Importación moderna de RxJS
import { TokenizeCardDto } from "./dto/tokenize-card.dto";

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
      this.mathClient.send({ cmd: "get_servicios" }, appId)
    );
  }


  async guardarTarjeta( idApp: number, cardData:TokenizeCardDto ) {

    const payloadInterno = {
      idApp: Number(idApp),
      ...cardData // Agrega card_number, card_holder, etc.
    };

    return firstValueFrom(
      this.mathClient.send({ cmd: "save_card" }, payloadInterno)
    );
  }
}