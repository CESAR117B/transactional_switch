import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ServiciosModule } from './servicios/servicios.modules';

import { ConfigDbModule } from './config-db/config-db.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EncriptionKeysModule } from './keys/encription.keys.module';
import { IntegracionesModule } from './Integraciones/integraciones.module';


@Module({
  imports: [ EventEmitterModule.forRoot(),
    PrismaModule, AuthModule, ServiciosModule, IntegracionesModule, ConfigDbModule, EncriptionKeysModule],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
