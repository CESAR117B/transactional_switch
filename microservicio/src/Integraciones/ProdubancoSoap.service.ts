import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { ConfigDbService } from '../config-db/config-db.service';
import * as soap from 'soap';

@Injectable()
export class ProdubancoSoapService {
  private readonly logger = new Logger(ProdubancoSoapService.name);
  private client: soap.Client | null = null;
  private clientPromise: Promise<soap.Client> | null = null;
  private cachedWsdlUrl: string | null = null;

  constructor(private readonly configDb: ConfigDbService) {}

  private async getClient(): Promise<soap.Client> {
    // FIX: await obligatorio - antes se accedia a Promise.wds_url = undefined
    const config = await this.configDb.getProdubancoConfig();
    const wsdlUrl = config.wsdl_url || config.wsdl_url;

    if (!wsdlUrl) {
      throw new InternalServerErrorException(
        'WSDL URL de Produbanco no configurada en BD (PRODUBANCO_WSDL_URL)',
      );
    }

    // Reutilizar cliente si WSDL no cambió
    if (this.client && this.cachedWsdlUrl === wsdlUrl) {
      return this.client;
    }

    // Evitar race condition: si ya hay creación en curso, reutilizar promesa
    if (this.clientPromise) {
      return this.clientPromise;
    }

    this.logger.log(`Creando cliente SOAP Produbanco: ${wsdlUrl}`);
    this.cachedWsdlUrl = wsdlUrl;

    this.clientPromise = soap
      .createClientAsync(wsdlUrl)
      .then((c) => {
        this.client = c;
        return c;
      })
      .catch((err) => {
        // Invalidar cache en fallo para reintentar próximo llamado
        this.cachedWsdlUrl = null;
        throw err;
      })
      .finally(() => {
        this.clientPromise = null;
      });

    return this.clientPromise;
  }

  /**
   * Envía las credenciales y el XML plano para autenticar la petición y obtener la trama encriptada.
   */
  async autenticarYEncriptar(xmlContenido: string): Promise<string> {
    try {
      // FIX: una sola llamada await a config (antes 3 llamadas sin await)
      const config = await this.configDb.getProdubancoConfig();
      const client = await this.getClient();

      const payload = {
        empresa: config.empresa,
        usuario: config.usuario,
        clave: config.password,
        xmlEntrada: xmlContenido,
      };

      if (!payload.empresa || !payload.usuario || !payload.clave) {
        throw new Error(
          'Credenciales incompletas de Produbanco (empresa/usuario/clave vacíos)',
        );
      }

      this.logger.debug(
        `Invocando DevuelveXmlEncriptado empresa=${payload.empresa} usuario=${payload.usuario}`,
      );

      // Invocación del método DevuelveXmlEncriptado del WebService
      const [result] = await (client as any).DevuelveXmlEncriptadoAsync(payload);

      const tramaEncriptada = result?.DevuelveXmlEncriptadoResult;
      if (!tramaEncriptada) {
        throw new Error(
          'Respuesta inválida o rechazada por las credenciales de Produbanco.',
        );
      }

      return tramaEncriptada;
    } catch (error: any) {
      // Invalidar cliente SOAP en errores de autenticación/red para forzar recreación
      this.client = null;

      // Preservar RpcException de ConfigDbService (404/500 por BD) sin envolver
      if (error instanceof RpcException) {
        this.logger.error(
          'Configuración Produbanco no disponible',
          error.message as any,
        );
        throw error;
      }

      const stack = error?.stack || JSON.stringify(error);
      const message = error?.message || 'Error desconocido SOAP';
      this.logger.error('Error en autenticación SOAP con Produbanco', stack);
      throw new InternalServerErrorException(
        `Fallo al autenticar/encriptar con Produbanco: ${message}`,
      );
    }
  }

  /** Para testing: limpiar cliente cacheado */
  clearClientCache() {
    this.client = null;
    this.clientPromise = null;
    this.cachedWsdlUrl = null;
  }
}
