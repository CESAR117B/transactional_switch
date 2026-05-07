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
    async saveCard(cardData: TokenizeCardDto) {
        
        // 🚨 RIESGO RESUELTO: Solo logueamos que se inició el proceso, NUNCA imprimimos el cardData completo.
        // Si necesitas loguear algo, enmascara la tarjeta:
        const tarjetaEnmascarada = `****-****-****-${cardData.card_number.slice(-4)}`;
        this.logger.log(`Iniciando tokenización para la tarjeta: ${tarjetaEnmascarada}`);

        let tokenResponse;

        // 2. Agregamos "await" para que el código se detenga hasta tener el token
        if (cardData.temporal) {
           tokenResponse = await this.firstoken.temporal_token_card(cardData);
        } else {
            tokenResponse = await this.firstoken.permanent_token_card(cardData);
        }

        // 3. Ahora SÍ puedes extraer el token (ej. tokenResponse.token_id)
        // y usar Prisma para guardarlo en tu tabla de clientes/tarjetas
        // const guardadoBd = await this.prisma.tarjetasGuardadas.create({ ... });

        return tokenResponse;
    }
}