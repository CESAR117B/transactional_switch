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
    const config = await this.configDb.getProdubancoConfig();
    const wsdlUrl = config.wsdl_url;

    if (!wsdlUrl) {
      throw new InternalServerErrorException(
        'WSDL URL de Produbanco no configurada en BD (PRODUBANCO_WSDL_URL)',
      );
    }

    if (this.client && this.cachedWsdlUrl === wsdlUrl) {
      return this.client;
    }

    if (this.clientPromise) {
      return this.clientPromise;
    }

    this.logger.log(`Creando cliente SOAP Produbanco: ${wsdlUrl}`);
    this.cachedWsdlUrl = wsdlUrl;

    // Configuración de timeout para evitar peticiones colgadas
    const options = {
      timeout: 15000, // 15 segundos de timeout de red
    } as soap.IOptions;

    this.clientPromise = soap
      .createClientAsync(wsdlUrl, options)
      .then((c) => {
        this.client = c;
        return c;
      })
      .catch((err) => {
        this.clearClientCache();
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

      const [result] = await (client as any).DevuelveXmlEncriptadoAsync(payload);
      const tramaEncriptada = result?.DevuelveXmlEncriptadoResult;

      if (!tramaEncriptada) {
        throw new Error(
          'Respuesta inválida o rechazada por las credenciales de Produbanco.',
        );
      }

      return tramaEncriptada;
    } catch (error: any) {
      // Limpieza total del caché en caso de fallo de red o transporte
      this.clearClientCache();

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

  /**
   * Envía el sobre encriptado a Produbanco para procesar la orden masiva.
   */
  async cargarDirectaXml(tramaEncriptada: string): Promise<string> {
    try {
      const client = await this.getClient();
      const [result] = await (client as any).CargaDirectaXmlAsync({
        xmlEntrada: tramaEncriptada,
      });

      const envioId = result?.CargaDirectaXmlResult;
      if (!envioId) {
        throw new Error('No se recibió un Envio_Id válido desde Produbanco.');
      }

      return envioId;
    } catch (error: any) {
      this.clearClientCache();
      throw new InternalServerErrorException(
        `Fallo al ejecutar CargaDirectaXml en Produbanco: ${error.message}`,
      );
    }
  }

  /** Limpia el estado interno cacheado del cliente SOAP */
  clearClientCache() {
    this.client = null;
    this.clientPromise = null;
    this.cachedWsdlUrl = null;
  }
}