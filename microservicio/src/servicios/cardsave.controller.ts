
import { MessagePattern, Payload } from "@nestjs/microservices";

import { Controller, Req } from "@nestjs/common";
import { TokenizeCardDto } from "../dto/tokenize-card.dto";
import { CardSaveService } from "./carsave.service";
import { SaveCardInternalDto } from "../dto/save-card-internal.dto";

@Controller()
export class CardSaveController {
    constructor(
        private cardSaveService: CardSaveService
    ){}

    @MessagePattern({ cmd: 'save_card' })
    async saveCard(@Req() req: any,@Payload() payload: SaveCardInternalDto) {
        
        // Magia de TypeScript: extraemos idApp y metemos el resto en cardData
        const { idApp, ...cardData } = payload;
        
        // Le pasamos los dos parámetros por separado a tu servicio
        return await this.cardSaveService.saveCard(idApp, cardData);
    }
}