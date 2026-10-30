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
import { AdminAppsController } from './admin-apps.controller';
import { AdminProdubancoController } from './admin-produbanco.controller';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ApiKeyGuard } from './api-key.guard';
import { AppThrottlerGuard } from './app-throttler.guard';
import { HealthController } from './health.controller';
import {
  MicroserviceRpcService,
  timeoutMicroservicioMs,
} from './microservice-rpc.service';
import {
  rateLimitIpMax,
  rateLimitIpVentanaMs,
} from './throttler.config';

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
          // Evita que una petición quede colgada si el microservicio deja de
          // responder (default interno de Nest: 5 minutos).
          messageReceiveTimeout: timeoutMicroservicioMs(),
          incompleteMessageTimeout: timeoutMicroservicioMs(),
        },
      },
    ]),

    JwtModule.register({
      global: true,
      // Única fuente de verdad: sign y verifyAsync usan este secret.
      secret: jwtSecret,
      signOptions: { expiresIn: '1h' },
    }),

    // Rate limit global por IP (RATE_LIMIT_IP_MAX, 100/min por defecto);
    // /auth/login lo restringe a 5 con @Throttle({ default: ... }). Las Apps
    // autenticadas tienen además su propio límite (RATE_LIMIT_APP_MAX,
    // 10/min por defecto) en AppThrottlerGuard.
    ThrottlerModule.forRoot({
      throttlers: [
        { ttl: rateLimitIpVentanaMs(), limit: rateLimitIpMax() },
      ],
    }),
  ],
  controllers: [
    AppController,
    SaveCardsController,
    ServiciosController,
    AuthController,
    TramasProdubancoController,
    AdminAppsController,
    AdminProdubancoController,
    HealthController,
  ],
  providers: [
    AppService,
    MicroserviceRpcService,
    // Orden importa:
    // 1) ThrottlerGuard   → rate limit por IP (100 req/min; login 5/min).
    // 2) ApiKeyGuard      → autenticación JWT + revalidación de servicios
    //                       vigentes contra el microservicio (sin caché:
    //                       un apagado global o por app aplica al instante).
    // 3) AppThrottlerGuard→ rate limit por App autenticada (10/min por
    //                       defecto, bucket global compartido por todos los
    //                       endpoints; ver .env → throttler.config.ts).
    // Fail-closed: TODO endpoint nuevo queda protegido por JWT salvo que
    // marque explícitamente @Public().
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
  ],
})
export class AppModule {}
