import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // 1. Obtenemos la variable de entorno
    const connectionString = `${process.env.DATABASE_URL}`;
    
    // 2. Creamos el Pool de conexiones usando 'pg'
    const pool = new Pool({ connectionString });
    
    // 3. Inicializamos el adaptador
    const adapter = new PrismaPg(pool);

    // 4. Se lo pasamos al constructor de la clase padre (PrismaClient)
    super({ adapter });
  }

  // Se ejecuta automáticamente al levantar la aplicación
  async onModuleInit() {
    await this.$connect();
  }

  // Se ejecuta automáticamente al apagar la aplicación
  async onModuleDestroy() {
    await this.$disconnect();
  }
}