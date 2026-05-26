import { Module } from "@nestjs/common";
import { EncriptionKeysController } from "./encription.keys.controller";
import { ApplicationService } from "../servicios/application.service";


@Module({
    controllers: [EncriptionKeysController]
})                                                  
export class EncriptionKeysModule {

}