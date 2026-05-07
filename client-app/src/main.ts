import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
   const config = new DocumentBuilder()
    .setTitle('Switch de pagos - API Gateway')
    .setDescription('Documentación de la API con Swagger')
    .setVersion('1.6')
    // 👇 1. Le enseñamos a Swagger que existe el header x-app-id
    .addApiKey({ type: 'apiKey', name: 'x-app-id', in: 'header' }, 'AppId')
    // 👇 2. Le enseñamos a Swagger que existe el header x-app-key
    .addApiKey({ type: 'apiKey', name: 'x-app-key', in: 'header' }, 'AppKey')
    .build();
    
  const document = SwaggerModule.createDocument(app, config);

  // --- LÓGICA DE FILTRADO DINÁMICO ---
  
  // 1. Identificar todas las etiquetas explícitas y las potencialmente problemáticas.
  const explicitTags = new Set<string>();
  const multiTagEndpointsTags = new Set<string>();

  for (const path in document.paths) {
    for (const method in document.paths[path]) {
      const operation = document.paths[path][method];
      if (operation.tags) {
        if (operation.tags.length === 1) {
          // Si un endpoint tiene una sola etiqueta, la consideramos explícita y válida.
          explicitTags.add(operation.tags[0]);
        } else if (operation.tags.length > 1) {
          // Si tiene múltiples, todas son candidatas a ser problemáticas o explícitas.
          operation.tags.forEach(tag => multiTagEndpointsTags.add(tag));
        }
      }
    }
  }

  // Las etiquetas explícitas de los endpoints con múltiples tags también son válidas.
  multiTagEndpointsTags.forEach(tag => explicitTags.add(tag));
  
  // 2. Deducir las etiquetas a eliminar. Son las que aparecen en endpoints con
  //    múltiples etiquetas pero NUNCA solas en ningún endpoint.
  const tagsToRemove = [...multiTagEndpointsTags].filter(tag => {
    let isSingleTagElsewhere = false;
    for (const path in document.paths) {
        for (const method in document.paths[path]) {
            const op = document.paths[path][method];
            if (op.tags && op.tags.length === 1 && op.tags[0] === tag) {
                isSingleTagElsewhere = true;
                break;
            }
        }
        if (isSingleTagElsewhere) break;
    }
    return !isSingleTagElsewhere;
  });

  // 3. Iterar de nuevo para limpiar los endpoints y la lista de tags principal
  document.tags = document.tags?.filter(tag => !tagsToRemove.includes(tag.name));

  for (const path in document.paths) {
    for (const method in document.paths[path]) {
      const operation = document.paths[path][method];
      if (operation.tags) {
        operation.tags = operation.tags.filter(tag => !tagsToRemove.includes(tag));
        
        // Si un endpoint se queda sin etiquetas (como los de AppController), se elimina.
        if (operation.tags.length === 0) {
            delete document.paths[path][method];
        }
      } else {
        delete document.paths[path][method];
      }
    }
    if (Object.keys(document.paths[path]).length === 0) {
      delete document.paths[path];
    }
  }

  // --- FIN DE LA LÓGICA DE FILTRADO ---

  SwaggerModule.setup('doc', app, document, {
    jsonDocumentUrl: '/doc-json',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: false//'list',
    },
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
