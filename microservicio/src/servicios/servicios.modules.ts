import { Module } from "@nestjs/common";
import { ServicioController } from "./servicio.controller";
import { Servicios } from "./servicios";
import { CardSaveController } from "./cardsave.controller";
import { CardSaveService } from "./carsave.service";

@Module({
    controllers:[ServicioController,CardSaveController],
    providers:[Servicios,CardSaveService],
    exports:[Servicios,CardSaveService]
})
export class ServiciosModule{}