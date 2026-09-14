import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, RpcException, Transport } from '@nestjs/microservices';
import { BadRequestException, ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.TCP,
      options: { host: "127.0.0.1", port: 3001 },
    }
  );
   // Modificamos el pipe para que lance excepciones TCP
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true, // <--- ¡ESTA ES LA MAGIA QUE FALTABA!
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors) => {
        const flatten = (errs: any[], parent = ''): string[] =>
          errs.flatMap((e) => {
            const prefix = parent ? `${parent}.${e.property}` : e.property;
            const own = e.constraints ? Object.values(e.constraints as Record<string, string>) : [];
            // Prefija con path para nested (ej: data.detalles.0.monto)
            const prefixed = own.map((m) => (parent ? `${prefix}: ${m}` : m));
            if (e.children?.length) {
              return [...prefixed, ...flatten(e.children, prefix)];
            }
            return prefixed;
          });
        const messages = flatten(errors);
        // Fallback si queda vacío por estructura inesperada
        const finalMessages = messages.length ? messages : ['Validation failed'];
        return new RpcException({
          statusCode: 400,
          message: finalMessages,
          error: 'Bad Request',
        });
      },
    }),
  );
  await app.listen();
  console.log("Math Service is running on port 3001");


  /*const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);*/
}
bootstrap();
