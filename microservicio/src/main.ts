import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  MicroserviceOptions,
  RpcException,
  Transport,
} from '@nestjs/microservices';
import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import { RpcAuthPipe } from './common/rpc-auth.pipe';

loadEnv();

async function bootstrap() {
  const host = process.env.HOST;
  const port = parseInt(process.env.PORT ?? '3001', 10);
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.TCP,
      options: { host, port },
    },
  );
  // El orden importa: primero se valida el sobre con el secreto compartido y
  // se extrae el payload; luego corre la validación de DTOs.
  app.useGlobalPipes(
    new RpcAuthPipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true, // <--- ¡ESTA ES LA MAGIA QUE FALTABA!
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors) => {
        const flatten = (errs: any[], parent = ''): string[] =>
          errs.flatMap((e) => {
            const prefix = parent ? `${parent}.${e.property}` : e.property;
            const own = e.constraints
              ? Object.values(e.constraints as Record<string, string>)
              : [];
            // Prefija con path para nested (ej: data.detalles.0.monto)
            const prefixed = own.map((m) => (parent ? `${prefix}: ${m}` : m));
            if (e.children?.length) {
              return [...prefixed, ...flatten(e.children, prefix)];
            }
            return prefixed;
          });
        const messages = flatten(errors);
        // Fallback si queda vacío por estructura inesperada
        const finalMessages = messages.length
          ? messages
          : ['Validation failed'];
        return new RpcException({
          statusCode: 400,
          message: finalMessages,
          error: 'Bad Request',
        });
      },
    }),
  );
  await app.listen();
  new Logger('Bootstrap').log(`Microservicio escuchando en ${host}:${port}`);
}
bootstrap();
