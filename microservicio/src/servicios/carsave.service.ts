import { Injectable, Logger } from "@nestjs/common";
import { FirsTokenService } from "../Integraciones/FirstokenService.service";
import { TokenizeCardDto } from "../dto/tokenize-card.dto";

@Injectable()
export class CardSaveService {
    // Usamos el Logger oficial en lugar de console.log
    private readonly logger = new Logger(CardSaveService.name);

    constructor(
        private readonly firstoken: FirsTokenService
    ){}

    // 1. Agregamos "async"
    async saveCard(idApp: number, cardData: TokenizeCardDto) {
        
        // 🚨 RIESGO RESUELTO: Solo logueamos que se inició el proceso, NUNCA imprimimos el cardData completo.
        // Si necesitas loguear algo, enmascara la tarjeta:
        const tarjetaEnmascarada = `****-****-****-${cardData.card_number.slice(-4)}`;
        this.logger.log(`Iniciando tokenización para la tarjeta: ${tarjetaEnmascarada}`);

        let tokenResponse= null;

        // 2. Agregamos "await" para que el código se detenga hasta tener el token
        if (cardData.temporal) {
           tokenResponse = await this.firstoken.temporal_token_card(idApp, cardData);
        } else {
            tokenResponse = await this.firstoken.permanent_token_card(idApp, cardData);
        }


        return tokenResponse;
    }
}