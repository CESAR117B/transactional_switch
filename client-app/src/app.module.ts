import { config as loadEnv } from 'dotenv';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SaveCardsController } from './savecards.controller';
import { ServiciosController } from './servicios.controller';
import { AuthController } from './auth.controller';
import { TramasProdubancoController } from './TramasProdubanco.controller';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ApiKeyGuard } from './api-key.guard';

// Carga .env (sin sobreescribir variables ya definidas) ANTES de leer JWT_SECRET.
loadEnv();

// Fail-fast: sin secreto NO se arranca. Evita caer al antiguo fallback
// 'una_clave_secreta_provisional_123' (hardcodeado en el código = cualquiera
// podía forjar tokens con los permisos que quisiera).
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error(
    'Falta JWT_SECRET. Agrégalo a client-app/.env (genera uno con: ' +
      "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")",
  );
}

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'MATH_SERVICE',
        transport: Transport.TCP,
        options: {
          host: process.env.MICROSERVICE_HOST || '127.0.0.1',
          port: parseInt(process.env.MICROSERVICE_PORT ?? '3001', 10),
        },
      },
    ]),

    JwtModule.register({
      global: true,
      // Única fuente de verdad: sign y verifyAsync usan este secret.
      secret: jwtSecret,
      signOptions: { expiresIn: '1h' },
    }),

    // Rate limit global (100 req/min/IP); /auth/login lo restringe a 5 con @Throttle({ default: ... })
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: 100 }],
    }),
  ],
  controllers: [
    AppController,
    SaveCardsController,
    ServiciosController,
    AuthController,
    TramasProdubancoController,
  ],
  providers: [
    AppService,
    // Orden importa: primero rate limit, luego autenticación.
    // Fail-closed: TODO endpoint nuevo queda protegido por JWT salvo que
    // marque explícitamente @Public().
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
})
export class AppModule {}
