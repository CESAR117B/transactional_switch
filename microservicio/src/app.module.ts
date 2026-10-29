import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ServiciosModule } from './servicios/servicios.modules';

import { ConfigDbModule } from './config-db/config-db.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { IntegracionesModule } from './Integraciones/integraciones.module';
import { AdminModule } from './admin/admin.module';
import { ScheduleModule } from '@nestjs/schedule';
import { LogsModule } from './logs/log.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    PrismaModule,
    AuthModule,
    ServiciosModule,
    IntegracionesModule,
    ConfigDbModule,
    AdminModule,
    LogsModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
