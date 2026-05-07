import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ServiciosModule } from './servicios/servicios.modules';
import { IntegracionesModule } from './Integraciones/integraciones.module';
import { ConfigDbModule } from './config-db/config-db.module';

@Module({
  imports: [PrismaModule, AuthModule, ServiciosModule, IntegracionesModule, ConfigDbModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
