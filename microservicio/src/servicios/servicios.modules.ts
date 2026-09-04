import { Global, Module } from "@nestjs/common";
import { ServicioController } from "./servicio.controller";
import { Servicios } from "./servicios";
import { CardSaveController } from "./cardsave.controller";
import { CardSaveService } from "./carsave.service";
import { AuditoriaService } from "./auditoria.service";
import { ApplicationService } from "./application.service";
import { UniversalCryptoService } from "./universal-crypto.service";
import { TramasProdubancoController } from "./TramasProdubanco.controller";
import { TramasProdubancoService } from "./TramasProdubanco.service";

@Global()
@Module({
    controllers:[ServicioController,CardSaveController, TramasProdubancoController],
    providers:[Servicios,CardSaveService,AuditoriaService, ApplicationService,UniversalCryptoService, TramasProdubancoService],
    exports:[Servicios,CardSaveService,AuditoriaService, ApplicationService,UniversalCryptoService, TramasProdubancoService]
})
export class ServiciosModule{}