import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ConfigDbService } from "./config-db.service";

@Global()
@Module({
    imports: [PrismaModule],
    providers: [ConfigDbService],
    exports: [ConfigDbService]
})
export class ConfigDbModule {

}