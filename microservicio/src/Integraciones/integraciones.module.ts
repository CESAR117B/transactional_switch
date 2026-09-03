import { Global, Module } from "@nestjs/common";
import { FirsTokenService } from "./FirstokenService.service";
import { HttpModule } from "@nestjs/axios";

@Global()
@Module({
    imports: [
    HttpModule,
    // ConfigDbModule <-- Si ConfigDbService tiene su propio módulo, impórtalo aquí
    ],
    providers:[FirsTokenService],
    exports:[FirsTokenService]})
export class IntegracionesModule {

}