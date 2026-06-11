import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SaveCardsController } from './savecards.controller';
import { ServiciosController } from './servicios.controller';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'MATH_SERVICE',
        transport: Transport.TCP,
        options: {
          host: '127.0.0.1',
          port: 3001,
        },
      },
    ]),

    JwtModule.register({
      global: true, // 🌟 Al poner true, evitas tener que importarlo en cada submódulo de tu Gateway
      secret: process.env.JWT_SECRET || 'una_clave_secreta_provisional_123', // Usa tu variable del .env
      signOptions: { expiresIn: '1h' }, // Configuración por defecto para la expiración
    })
  ],
  controllers: [AppController,SaveCardsController,ServiciosController,AuthController],
  providers: [AppService],
})
export class AppModule {}
