import { Injectable, Logger } from "@nestjs/common";
import { RpcException } from "@nestjs/microservices";
import { PrismaService } from "../prisma/prisma.service";

export interface FirstTokenConfig {
    api_key: string;
    base_url: string;      // Payments API + TaaS
    inbound_url: string;       
    proxy_url: string;            // Proxy genérico
    transactions_url: string;  // convertToPermanent
    routes: {
        permanent_card: string; // UUID del Inbound Route permanente
        temporal_card: string;       // UUID del Inbound Route temporal (para tokenizar)
    };
    payment_scheme: string;    
    timeout: number;           
    retry_attempts: number;  
}

interface CacheItem<T> {
  data: T;
  expiresAt: number;
}

@Injectable()
export class ConfigDbService {
    private readonly logger = new Logger(ConfigDbService.name);

    private readonly CACHE_TTL = 300000; // 5 minutos en milisegundos

    // Corregido: Instanciamos el Map vacío para poder usar .get() y .set()
    private firstTokenConfigCache = new Map<string, CacheItem<FirstTokenConfig>>();

    constructor(private readonly prisma: PrismaService){}

    clearCache() {
        this.firstTokenConfigCache.clear();
        this.logger.log('Cache limpiada exitosamente');
    }

    async getFirstTokenConfig(): Promise<FirstTokenConfig> {
        // 1. Revisamos si la configuración para este tenant/ambiente ya está en memoria y aún es válida
        const cached = this.firstTokenConfigCache.get('FIRSTOKEN');
        
        if (cached && cached.expiresAt > Date.now()) {
            this.logger.debug(`Configuración recuperada desde caché`);
            return cached.data;
        }

        this.logger.log(`Consultando configuración en Base de Datos`);

        // 2. Buscamos en la base de datos usando Prisma
        // Asumimos que tenantId es el equivalente al "ambiente" en tu tabla (ej. 'PROD' o 'TENANT_1')
        const integracion = await this.prisma.integraciones.findFirst({
            where: {
                nombre: 'FIRSTOKEN', // El código fijo de tu integración
                activo: true
            },
            include: {
                atributos_integraciones: true
            }
        });

        if (!integracion || integracion.atributos_integraciones.length === 0) {
            throw new RpcException({ 
                status: 404, 
                message: `Configuración de FIRSTOKEN no encontrada o inactiva en la base de datos` 
            });
        }

        // 3. Inicializamos un objeto temporal para construir la configuración
        // Inicializamos 'routes' para evitar errores de "cannot set property of undefined"
        const config: Partial<FirstTokenConfig> = {};
        const routesConfig = { temporal_card: '' , permanent_card: '' }; // <-- ¡Esto evita el error de undefined!

        // 4. Iteramos sobre los atributos traídos de la BD
        integracion.atributos_integraciones.forEach(attr => {
            const valor = attr.valor || '';
            
            switch (attr.atributo) {
                case 'API_KEY': config.api_key = valor; break;
                case 'BASE_URL': config.base_url = valor; break;
                case 'INBOUND_URL': config.inbound_url = valor; break;
                case 'PROXY_URL': config.proxy_url = valor; break;
                case 'TRANSACTIONS_URL': config.transactions_url = valor; break;
                
                // Aquí guardamos en nuestra variable independiente
                case 'PERMANET_CARD': routesConfig.permanent_card = valor; break;
                case 'TEMPORAL_CARD': routesConfig.temporal_card = valor; break;
                
                case 'PAYMENT_SCHEME': config.payment_scheme = valor; break;
                case 'TIMEOUT': config.timeout = Number(valor); break;
                case 'RETRY_ATTEMPTS': config.retry_attempts = Number(valor); break;
            }
        });

        // Ensamblamos la pieza que faltaba
        config.routes = routesConfig;

        // 5. Validamos que los datos críticos realmente se hayan cargado desde la BD
        if (!config.api_key || !config.base_url) {
            throw new RpcException({ 
                status: 500, 
                message: 'Faltan atributos obligatorios (API_KEY o BASE_URL) en la tabla atributos_integraciones' 
            });
        }

        const finalConfig = config as FirstTokenConfig;

        // 6. Guardamos el resultado final en el Map de caché
        this.firstTokenConfigCache.set('FIRSTOKEN', {
            data: finalConfig,
            expiresAt: Date.now() + this.CACHE_TTL
        });

        return finalConfig;
    }
}