import { Module } from "@nestjs/common";
import { EncriptionKeysController } from "./encription.keys.controller";


@Module({
    controllers: [EncriptionKeysController]
})                                                  
export class EncriptionKeysModule {

}