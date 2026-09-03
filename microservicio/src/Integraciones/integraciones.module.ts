import { Global, Module } from "@nestjs/common";
import { FirsTokenService } from "./FirstokenService.service";
import { ProdubancoSoapService } from "./ProdubancoSoap.service";
import { HttpModule } from "@nestjs/axios";
import { ConfigDbModule } from "../config-db/config-db.module";

@Global()
@Module({
    imports: [
    HttpModule,
    ConfigDbModule,
    ],
    providers:[FirsTokenService, ProdubancoSoapService],
    exports:[FirsTokenService, ProdubancoSoapService]})
export class IntegracionesModule {

}