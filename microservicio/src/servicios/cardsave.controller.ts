
import { MessagePattern, Payload } from "@nestjs/microservices";

import { Controller } from "@nestjs/common";
import { CardSaveService } from "./carsave.service";
import { SaveCardInternalDto } from "../dto/save-card-internal.dto";

@Controller()
export class CardSaveController {
    constructor(
        private cardSaveService: CardSaveService
    ){}

    @MessagePattern({ cmd: 'save_card' })
    async saveCard(@Payload() payload: SaveCardInternalDto) {
        
        // Magia de TypeScript: extraemos idApp y metemos el resto en cardData
        const { idApp, ...cardData } = payload;
        
        // Le pasamos los dos parámetros por separado a tu servicio
        return await this.cardSaveService.saveCard(idApp, cardData);
    }
}