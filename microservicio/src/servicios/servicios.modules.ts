import { Module } from "@nestjs/common";
import { ServicioController } from "./servicio.controller";
import { Servicios } from "./servicios";
import { CardSaveController } from "./cardsave.controller";
import { CardSaveService } from "./carsave.service";
import { AuditoriaService } from "./auditoria.service";

@Module({
    controllers:[ServicioController,CardSaveController],
    providers:[Servicios,CardSaveService,AuditoriaService],
    exports:[Servicios,CardSaveService,AuditoriaService]
})
export class ServiciosModule{}