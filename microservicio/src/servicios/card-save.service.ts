import { Injectable, Logger } from '@nestjs/common';
import {
  FirstokenService,
  TokenizacionResult,
} from '../integraciones/firstoken.service';
import { TokenizeCardDto } from '../dto/tokenize-card.dto';

@Injectable()
export class CardSaveService {
  private readonly logger = new Logger(CardSaveService.name);

  constructor(private readonly firstoken: FirstokenService) {}

  async saveCard(idApp: number, cardData: TokenizeCardDto) {
    // Solo se loguea la tarjeta enmascarada; nunca el PAN completo ni el CVV.
    const tarjetaEnmascarada = `****-****-****-${cardData.card_number.slice(-4)}`;
    this.logger.log(
      `Iniciando tokenización para la tarjeta: ${tarjetaEnmascarada}`,
    );

    let tokenResponse: TokenizacionResult;

    if (cardData.temporal) {
      tokenResponse = await this.firstoken.temporalTokenCard(idApp, cardData);
    } else {
      tokenResponse = await this.firstoken.permanentTokenCard(
        idApp,
        cardData,
      );
    }

    return tokenResponse;
  }
}
