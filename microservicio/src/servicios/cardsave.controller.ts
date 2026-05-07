
import { MessagePattern, Payload } from "@nestjs/microservices";

import { Controller } from "@nestjs/common";
import { TokenizeCardDto } from "../dto/tokenize-card.dto";
import { CardSaveService } from "./carsave.service";

@Controller()
export class CardSaveController {
    constructor(
        private cardSaveService: CardSaveService
    ){}

    @MessagePattern({ cmd: 'save_card' }) // Cambiado a 'save_card'
    async saveCard(@Payload() cardData: TokenizeCardDto) { // Agregamos async
        return await this.cardSaveService.saveCard(cardData);
    }
}