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
      exceptionFactory: (errors) => {
        // ... (tu código de RpcException que ya teníamos)
        const messages = errors.map(error => Object.values(error.constraints || {})).flat();
        return new RpcException({
          statusCode: 400,
          message: messages,
          error: 'Bad Request'
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
