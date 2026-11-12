import { Injectable, Logger } from '@nestjs/common';
import { FirsTokenService } from '../Integraciones/FirstokenService.service';
import { TokenizeCardDto } from '../dto/tokenize-card.dto';

@Injectable()
export class CardSaveService {
  private readonly logger = new Logger(CardSaveService.name);

  constructor(private readonly firstoken: FirsTokenService) {}

  async saveCard(idApp: number, cardData: TokenizeCardDto) {
    // Solo se loguea la tarjeta enmascarada; nunca el PAN completo ni el CVV.
    const tarjetaEnmascarada = `****-****-****-${cardData.card_number.slice(-4)}`;
    this.logger.log(
      `Iniciando tokenización para la tarjeta: ${tarjetaEnmascarada}`,
    );

    let tokenResponse = null;

    if (cardData.temporal) {
      tokenResponse = await this.firstoken.temporal_token_card(idApp, cardData);
    } else {
      tokenResponse = await this.firstoken.permanent_token_card(
        idApp,
        cardData,
      );
    }

    return tokenResponse;
  }
}
