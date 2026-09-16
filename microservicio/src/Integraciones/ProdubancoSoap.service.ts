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
      throw new RpcException({
        statusCode: 500,
        message: 'WSDL URL de Produbanco no configurada en BD (PRODUBANCO_WSDL_URL)',
        error: 'Internal Server Error',
      });
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
        strComputador: '', 
        strUsuario: config.usuario,
        strXmlInput: xmlContenido,
        Empresa: config.empresa,
      };

      if (!payload.strUsuario || !payload.Empresa) {
        throw new Error(
          'Credenciales incompletas de Produbanco (empresa/usuario vacíos)',
        );
      }

      this.logger.debug(
        `Invocando DevuelveXmlEncriptado empresa=${payload.strComputador} usuario=${payload.strUsuario} Empresa=${payload.Empresa} xmlInputLength=${payload.strXmlInput.length}`,
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
      const rawMessage: string = error?.message || 'Error desconocido SOAP';
      const code: string = error?.code || '';
      // Punto 1: ENOTFOUND = DNS sin VPN/IP no whitelisted; diferenciar 502 Bad Gateway de 500
      const isNetworkDns =
        /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED|ENETUNREACH/i.test(rawMessage) ||
        /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED|ENETUNREACH/i.test(code);
      const wsdlHint = (await this.configDb.getProdubancoConfig().catch(() => ({ wsdl_url: 'desconocida' } as any)))?.wsdl_url;
      this.logger.error(`Error en autenticación SOAP con Produbanco [${code || 'no-code'}] wsdl=${wsdlHint}`, stack);
      throw new RpcException({
        statusCode: isNetworkDns ? 502 : 500,
        message: `Fallo al autenticar/encriptar con Produbanco: ${rawMessage}${isNetworkDns ? ' (DNS no resuelve servicios.produbanco.com.ec - requiere VPN/IP whitelisted de Produbanco o PRODUBANCO_MOCK=true para dev)' : ''}`,
        error: isNetworkDns ? 'Bad Gateway' : 'Internal Server Error',
      });
    }
  }

  /**
   * Envía el sobre encriptado a Produbanco para procesar la orden masiva.
   */
  async cargarDirectaXml(tramaEncriptada: string): Promise<string> {
  try {
    const config = await this.configDb.getProdubancoConfig(); // Se agregan las credenciales de config
    const client = await this.getClient();

    const payload = {
      strXmlInput: tramaEncriptada,
      strUsuario: config.usuario,
      strComputador: '', // Usar la IP autorizada en Produbanco
      Empresa: config.empresa,
    };

    const [result] = await (client as any).CargaDirectaXmlAsync(payload);

    const envioId = result?.CargaDirectaXmlResult;
    if (!envioId) {
      throw new Error('No se recibió un Envio_Id válido desde Produbanco.');
    }

    return envioId;
  } catch (error: any) {
    if (error instanceof RpcException) throw error;
    this.clearClientCache();
    const rawMessage: string = error?.message || 'Error desconocido SOAP';
    const code: string = error?.code || '';
    const isNetworkDns =
      /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED|ENETUNREACH/i.test(rawMessage) ||
      /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED|ENETUNREACH/i.test(code);
    throw new RpcException({
      statusCode: isNetworkDns ? 502 : 500,
      message: `Fallo al ejecutar CargaDirectaXml en Produbanco: ${rawMessage}${isNetworkDns ? ' (DNS no resuelve - requiere VPN)' : ''}`,
      error: isNetworkDns ? 'Bad Gateway' : 'Internal Server Error',
    });
  }
}

  /** Limpia el estado interno cacheado del cliente SOAP */
  clearClientCache() {
    this.client = null;
    this.clientPromise = null;
    this.cachedWsdlUrl = null;
  }
}