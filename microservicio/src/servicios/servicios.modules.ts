import { Module } from "@nestjs/common";
import { ServicioController } from "./servicio.controller";
import { Servicios } from "./servicios";
import { CardSaveController } from "./cardsave.controller";
import { CardSaveService } from "./carsave.service";
import { AuditoriaService } from "./auditoria.service";
import { ApplicationService } from "./application.service";

@Module({
    controllers:[ServicioController,CardSaveController],
    providers:[Servicios,CardSaveService,AuditoriaService, ApplicationService],
    exports:[Servicios,CardSaveService,AuditoriaService, ApplicationService]
})
export class ServiciosModule{}