import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class ApplicationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * OPCIÓN 1: Agrega o actualiza la llave de encriptación de UNA app específica
   * @param idApp ID de la aplicación que ya está registrada
  */
  async addEncryptionKeyToApp(idApp: number) {
    // 1. Validamos si la aplicación realmente existe
    const app = await this.prisma.app.findUnique({
      where: { id_app: idApp },
    });

    if (!app) {
      throw new NotFoundException(`La aplicación con ID ${idApp} no existe en la base de datos.`);
    }

    // 2. Generamos una nueva llave aleatoria y segura de 32 caracteres (16 bytes en hex = 32 chars)
    const newEncryptionKey = crypto.randomBytes(16).toString('hex');

    // 3. Actualizamos el registro en Prisma
    const updatedApp = await this.prisma.app.update({
      where: { id_app: idApp },
      data: {
        encryptionKey: newEncryptionKey,
      },
    });

    // 4. Retornamos la información para que puedas dársela al desarrollador de esa App
    return {
      idApp: updatedApp.id_app.toString(),
      message: '✅ Llave de encriptación generada y guardada con éxito.',
      encryption_key: newEncryptionKey, // 👈 Esta es la que deben poner en su .env
    };
  }

  /**
   * OPCIÓN 2: Script automático para actualizar TODAS las apps existentes
   * Útil si tienes registros viejos con el campo vacío o con datos basura.
   */
  async migrateAllExistingApps() {
    // 1. Buscamos todas las aplicaciones registradas
    const allApps = await this.prisma.app.findMany();
    
    const resumenMigracion = [];

    // 2. Recorremos cada app y le inyectamos una llave única
    for (const app of allApps) {
      const generatedKey = crypto.randomBytes(16).toString('hex');

      await this.prisma.app.update({
        where: { id_app: app.id_app },
        data: {
          encryptionKey: generatedKey,
        },
      });
      
    }

    return {
      message: `⚡ Migración exitosa. Se actualizaron ${allApps.length} aplicaciones antiguas.`,
    };
  }
}