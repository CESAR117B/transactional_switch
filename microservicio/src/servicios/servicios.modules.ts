import { Global, Module } from "@nestjs/common";
import { ServicioController } from "./servicio.controller";
import { Servicios } from "./servicios";
import { CardSaveController } from "./cardsave.controller";
import { CardSaveService } from "./carsave.service";
import { AuditoriaService } from "./auditoria.service";
import { ApplicationService } from "./application.service";
import { UniversalCryptoService } from "./universal-crypto.service";

@Global()
@Module({
    controllers:[ServicioController,CardSaveController],
    providers:[Servicios,CardSaveService,AuditoriaService, ApplicationService,UniversalCryptoService],
    exports:[Servicios,CardSaveService,AuditoriaService, ApplicationService,UniversalCryptoService]
})
export class ServiciosModule{}