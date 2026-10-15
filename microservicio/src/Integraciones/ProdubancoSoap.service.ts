import { Injectable, Logger } from '@nestjs/common';
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

  /**
   * Normaliza la URL del WSDL: si no incluye el sufijo `?wsdl`, la librería `soap`
   * recibe la página HTML de descripción ASMX de IIS y falla con
   * "Root element of WSDL was <html>".
   */
  private normalizarWsdlUrl(url: string): string {
    const limpia = url.trim();
    if (/[?&]wsdl\b/i.test(limpia)) {
      return limpia;
    }
    const urlSinFragmento = limpia.split('#')[0];
    return urlSinFragmento.includes('?')
      ? `${urlSinFragmento}&wsdl`
      : `${urlSinFragmento}?wsdl`;
  }

  /**
   * Deriva la URL pública del servicio quitando el parámetro `?wsdl`.
   * El WSDL de Produbanco declara en `<soap:address>` su IP interna
   * (172.10.18.74), inaccesible desde fuera; el Manual Técnico indica que el
   * consumo debe hacerse vía el dominio público (webcore.produbanco.ec),
   * por lo que este endpoint se fuerza con `client.setEndpoint()`.
   */
  private getEndpointUrl(wsdlUrl: string): string {
    return wsdlUrl
      .replace(/\?wsdl\b/i, '')
      .replace(/&wsdl\b/i, '')
      .replace(/\?$/, '');
  }

  /**
   * Clasifica errores de transporte: red genérica y timeouts/rechazos hacia una
   * IP literal (la IP interna de Produbanco embebida en el WSDL).
   */
  private analizarErrorTransporte(rawMessage: string, code: string) {
    const esErrorRed =
      /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH/i.test(
        rawMessage,
      ) ||
      /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH/i.test(
        code,
      );
    const ipInterna =
      rawMessage.match(
        /connect (?:ETIMEDOUT|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH) (\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?/i,
      )?.[1] ?? '';
    return { esErrorRed, ipInterna };
  }

  private async getClient(): Promise<soap.Client> {
    const config = await this.configDb.getProdubancoConfig();

    if (!config.wsdl_url) {
      throw new RpcException({
        statusCode: 500,
        message:
          'WSDL URL de Produbanco no configurada en BD (PRODUBANCO_WSDL_URL)',
        error: 'Internal Server Error',
      });
    }

    const wsdlUrl = this.normalizarWsdlUrl(config.wsdl_url);
    const endpointUrl = this.getEndpointUrl(wsdlUrl);

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
        // El WSDL apunta a la IP interna de Produbanco; forzar el dominio público
        c.setEndpoint(endpointUrl);
        this.logger.log(`Endpoint SOAP Produbanco forzado a: ${endpointUrl}`);
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
        strComputador: config.ip,
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

      const [result] = await (client as any).DevuelveXmlEncriptadoAsync(
        payload,
      );
      const resultado: string = result?.DevuelveXmlEncriptadoResult ?? '';

      if (!resultado) {
        throw new Error(
          'Respuesta inválida o rechazada por las credenciales de Produbanco.',
        );
      }

      // Formato del manual: Codigo_Respuesta|Trama_Encriptada.
      // Solo la trama (Base64) se envía a CargaDirectaXml; el prefijo "0000|"
      // causa "input is not a valid Base-64 string" en el banco.
      const sep = resultado.indexOf('|');
      if (sep === -1) {
        throw new Error(
          `Respuesta inesperada de DevuelveXmlEncriptado (formato distinto a Codigo|Trama): ${resultado.substring(0, 120)}`,
        );
      }
      const codigo = resultado.substring(0, sep).trim();
      const tramaEncriptada = resultado.substring(sep + 1).trim();

      if (codigo !== '0000') {
        throw new Error(
          `Produbanco rechazó DevuelveXmlEncriptado [${codigo}]: ${tramaEncriptada}`,
        );
      }
      if (!tramaEncriptada) {
        throw new Error(
          'DevuelveXmlEncriptado devolvió código 0000 pero la trama encriptada está vacía.',
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
      const { esErrorRed, ipInterna } = this.analizarErrorTransporte(
        rawMessage,
        code,
      );
      // El WSDL respondió HTML (falta ?wsdl o el endpoint devolvió una página web)
      const isWsdlHtml = /Root element of WSDL was <html>/i.test(rawMessage);
      const wsdlHint = (
        await this.configDb
          .getProdubancoConfig()
          .catch(() => ({ wsdl_url: 'desconocida' }) as any)
      )?.wsdl_url;
      this.logger.error(
        `Error en autenticación SOAP con Produbanco [${code || 'no-code'}] wsdl=${wsdlHint}`,
        stack,
      );
      if (isWsdlHtml) {
        throw new RpcException({
          statusCode: 502,
          message: `Fallo al autenticar/encriptar con Produbanco: la URL del WSDL devolvió HTML en lugar de WSDL (${wsdlHint}). Verifique que PRODUBANCO_WSDL_URL incluya el sufijo "?wsdl" y que el endpoint no devuelva una página web.`,
          error: 'Bad Gateway',
        });
      }
      if (esErrorRed && ipInterna) {
        throw new RpcException({
          statusCode: 502,
          message: `Fallo al autenticar/encriptar con Produbanco: timeout/conexión rechazada hacia la IP interna declarada en el WSDL (${ipInterna}:80). El endpoint se fuerza al dominio público (webcore.produbanco.ec); si el error persiste, requiere VPN/IP whitelisted de Produbanco.`,
          error: 'Bad Gateway',
        });
      }
      throw new RpcException({
        statusCode: esErrorRed ? 502 : 500,
        message: `Fallo al autenticar/encriptar con Produbanco: ${rawMessage}${esErrorRed ? ' (error de red/VPN hacia webcore.produbanco.ec - requiere IP whitelisted de Produbanco)' : ''}`,
        error: esErrorRed ? 'Bad Gateway' : 'Internal Server Error',
      });
    }
  }

  /**
   * Envía el sobre encriptado a Produbanco para procesar la orden masiva.
   * Devuelve el Envio_Id junto con el <Estado> (VALIDADO/...) y
   * <MensajeRespuesta> de la cabecera de la respuesta[cite: 4].
   */
  async cargarDirectaXml(
    tramaEncriptada: string,
  ): Promise<{ envioId: string; estado: string; mensaje: string | null }> {
    try {
      const config = await this.configDb.getProdubancoConfig(); // Se agregan las credenciales de config
      const client = await this.getClient();

      const payload = {
        strXmlInput: tramaEncriptada,
        strUsuario: config.usuario,
        strComputador: config.ip, // Usar la IP autorizada en Produbanco
        Empresa: config.empresa,
      };

      const [result] = await (client as any).CargaDirectaXmlAsync(payload);

      const respuesta: string = result?.CargaDirectaXmlResult ?? '';
      if (!respuesta) {
        throw new Error('No se recibió una respuesta válida desde Produbanco.');
      }

      // Formato de error del banco: "9999|<mensaje>" (no es XML)
      const codigoBanco = respuesta.match(/^(\d{4})\|([\s\S]*)$/);
      if (codigoBanco) {
        if (codigoBanco[1] !== '0000') {
          throw new Error(
            `Produbanco rechazó CargaDirectaXml [${codigoBanco[1]}]: ${codigoBanco[2].trim()}`,
          );
        }
        // Éxito documentado es XML; "0000|..." no es un formato soportado
        throw new Error(
          `Respuesta inesperada de CargaDirectaXml (0000| no documentado, se esperaba XML): ${respuesta.substring(0, 120)}`,
        );
      }

      // Formato de éxito: XML con <Resultado><Cabecera><Envio_Id>...
      if (!respuesta.includes('<Cabecera>')) {
        throw new Error(
          `Respuesta inesperada de CargaDirectaXml (ni error Codigo|Trama ni XML): ${respuesta.substring(0, 120)}`,
        );
      }

      const envioId = respuesta.match(/<Envio_Id>(\d+)<\/Envio_Id>/)?.[1];
      const estado = respuesta.match(/<Estado>([^<]*)<\/Estado>/)?.[1]?.trim();
      const mensaje = respuesta
        .match(/<MensajeRespuesta>([^<]*)<\/MensajeRespuesta>/)?.[1]
        ?.trim();

      if (estado === 'INVALIDO') {
        // Ítems rechazados por datos incorrectos: NO es un envío procesado
        const detalles = [
          ...respuesta.matchAll(/<Resultado>([^<]*)<\/Resultado>/g),
        ]
          .map((m) => m[1].trim())
          .filter((d) => d && d !== 'ENVIO OK');
        throw new Error(
          `Produbanco rechazó la orden (Envio_Id=${envioId ?? 'N/A'}, Estado=INVALIDO): ${mensaje || 'favor revise el archivo de su orden'}` +
            (detalles.length ? ` | Detalle: ${detalles.join(' ; ')}` : ''),
        );
      }

      if (!envioId) {
        throw new Error(
          `Respuesta de CargaDirectaXml sin Envio_Id (estado=${estado || 'desconocido'}): ${respuesta.substring(0, 120)}`,
        );
      }

      return { envioId, estado: estado ?? '', mensaje: mensaje ?? null };
    } catch (error: any) {
      if (error instanceof RpcException) throw error;
      this.clearClientCache();
      const rawMessage: string = error?.message || 'Error desconocido SOAP';
      const code: string = error?.code || '';
      const { esErrorRed, ipInterna } = this.analizarErrorTransporte(
        rawMessage,
        code,
      );
      const isWsdlHtml = /Root element of WSDL was <html>/i.test(rawMessage);
      if (isWsdlHtml) {
        const wsdlHint = (
          await this.configDb
            .getProdubancoConfig()
            .catch(() => ({ wsdl_url: 'desconocida' }))
        )?.wsdl_url;
        throw new RpcException({
          statusCode: 502,
          message: `Fallo al ejecutar CargaDirectaXml en Produbanco: la URL del WSDL devolvió HTML en lugar de WSDL (${wsdlHint}). Verifique que PRODUBANCO_WSDL_URL incluya el sufijo "?wsdl".`,
          error: 'Bad Gateway',
        });
      }
      if (esErrorRed && ipInterna) {
        throw new RpcException({
          statusCode: 502,
          message: `Fallo al ejecutar CargaDirectaXml en Produbanco: timeout/conexión rechazada hacia la IP interna declarada en el WSDL (${ipInterna}:80). El endpoint se fuerza al dominio público (webcore.produbanco.ec); si el error persiste, requiere VPN/IP whitelisted de Produbanco.`,
          error: 'Bad Gateway',
        });
      }
      throw new RpcException({
        statusCode: esErrorRed ? 502 : 500,
        message: `Fallo al ejecutar CargaDirectaXml en Produbanco: ${rawMessage}${esErrorRed ? ' (error de red/VPN hacia webcore.produbanco.ec - requiere IP whitelisted de Produbanco)' : ''}`,
        error: esErrorRed ? 'Bad Gateway' : 'Internal Server Error',
      });
    }
  }

  /** Limpia el estado interno cacheado del cliente SOAP */
  clearClientCache() {
    this.client = null;
    this.clientPromise = null;
    this.cachedWsdlUrl = null;
  }

  // ==========================================
  // CONSULTA DE ESTADO (Manual 2.2.1 / 2.3.1)
  // ==========================================

  /** Extrae message/code de un error desconocido sin usar `any`. */
  private infoErrorSoap(error: unknown): { message: string; code: string } {
    const e = error as { message?: unknown; code?: unknown } | undefined;
    return {
      message:
        typeof e?.message === 'string' ? e.message : 'Error desconocido SOAP',
      code: typeof e?.code === 'string' ? e.code : '',
    };
  }

  /** Invoca un método SOAP de consulta y centraliza la clasificación de errores
   * (red/VPN, WSDL en HTML, RpcException de parseo) con mensajes parametrizados.
   */
  private async lanzarErrorSoap(
    metodo: string,
    error: unknown,
  ): Promise<never> {
    if (error instanceof RpcException) {
      throw error;
    }
    this.clearClientCache();
    const info = this.infoErrorSoap(error);
    const rawMessage = info.message;
    const code = info.code;
    const { esErrorRed, ipInterna } = this.analizarErrorTransporte(
      rawMessage,
      code,
    );
    const isWsdlHtml = /Root element of WSDL was <html>/i.test(rawMessage);
    if (isWsdlHtml) {
      const wsdlHint = (
        await this.configDb
          .getProdubancoConfig()
          .catch(() => ({ wsdl_url: 'desconocida' }))
      )?.wsdl_url;
      throw new RpcException({
        statusCode: 502,
        message: `Fallo al ejecutar ${metodo} en Produbanco: la URL del WSDL devolvió HTML en lugar de WSDL (${wsdlHint}). Verifique que PRODUBANCO_WSDL_URL incluya el sufijo "?wsdl".`,
        error: 'Bad Gateway',
      });
    }
    if (esErrorRed && ipInterna) {
      throw new RpcException({
        statusCode: 502,
        message: `Fallo al ejecutar ${metodo} en Produbanco: timeout/conexión rechazada hacia la IP interna declarada en el WSDL (${ipInterna}:80). El endpoint se fuerza al dominio público (webcore.produbanco.ec); si el error persiste, requiere VPN/IP whitelisted de Produbanco.`,
        error: 'Bad Gateway',
      });
    }
    throw new RpcException({
      statusCode: esErrorRed ? 502 : 500,
      message: `Fallo al ejecutar ${metodo} en Produbanco: ${rawMessage}${esErrorRed ? ' (error de red/VPN hacia webcore.produbanco.ec - requiere IP whitelisted de Produbanco)' : ''}`,
      error: esErrorRed ? 'Bad Gateway' : 'Internal Server Error',
    });
  }

  /**
   * Interpreta la respuesta de ConsultaOrdenes/ConsultaMovimientos (Manual §2.2.1/§2.3.1):
   * - "9999|<mensaje>"  -> error interno del método (502)
   * - XML <Resultado>    -> parametrización incorrecta (502)
   * - JSON con CodRetorno 0005 -> sin datos (NO es error: { sinDatos: true })
   * - JSON con CodRetorno 0001 -> registros parseados
   */
  private parsearResultadoConsulta(
    metodo: string,
    raw: string,
    claveRegistros: string,
  ): ResultadoConsulta {
    const texto = (raw ?? '').trim();
    if (!texto) {
      throw new RpcException({
        statusCode: 502,
        message: `${metodo} devolvió una respuesta vacía desde Produbanco.`,
        error: 'Bad Gateway',
      });
    }
    const rechazo = texto.match(/^(\d{4})\|([\s\S]*)$/);
    if (rechazo) {
      throw new RpcException({
        statusCode: 502,
        message: `Produbanco rechazó ${metodo} [${rechazo[1]}]: ${rechazo[2].trim()}`,
        error: 'Bad Gateway',
      });
    }
    if (texto.startsWith('<')) {
      const estado =
        texto.match(/<Estado>([^<]*)<\/Estado>/)?.[1]?.trim() ?? 'ERROR';
      const mensaje =
        texto
          .match(/<MensajeRespuesta>([^<]*)<\/MensajeRespuesta>/)?.[1]
          ?.trim() ?? texto.substring(0, 160);
      throw new RpcException({
        statusCode: 502,
        message: `${metodo}: ${estado} - ${mensaje}`,
        error: 'Bad Gateway',
      });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(texto);
    } catch {
      throw new RpcException({
        statusCode: 502,
        message: `Respuesta inesperada de ${metodo} (no es JSON): ${texto.substring(0, 120)}`,
        error: 'Bad Gateway',
      });
    }
    const data = (parsed ?? {}) as Record<string, unknown>;
    const trx = Array.isArray(data['TRX'])
      ? (data['TRX'] as Array<Record<string, unknown>>)
      : [];
    const codigos = trx.map((t) => {
      const c = t['CodRetorno'];
      return typeof c === 'string' || typeof c === 'number' ? String(c) : '';
    });
    if (codigos.includes('0005')) {
      return { sinDatos: true, registros: [] };
    }
    if (codigos.length > 0 && !codigos.includes('0001')) {
      const msj = trx
        .map((t) => {
          const m = t['MsjRetorno'];
          return typeof m === 'string' ? m : '';
        })
        .filter(Boolean)
        .join(' | ');
      throw new RpcException({
        statusCode: 502,
        message: `${metodo} falló [${codigos.join(',')}]: ${msj || 'sin detalle'}`,
        error: 'Bad Gateway',
      });
    }
    const registros = Array.isArray(data[claveRegistros])
      ? (data[claveRegistros] as unknown[])
      : [];
    return { sinDatos: registros.length === 0, registros };
  }

  /** Fecha actual en formato ddMMyyyy (aceptado por ambos métodos de consulta). */
  private fechaActualDdMmYyyy(): string {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}${mm}${d.getFullYear()}`;
  }

  /**
   * Consulta el estado de las órdenes (sobres) por Envio_Id (idBuzon)[cite: 2.2.1].
   * Devuelve los registros de Consulta_Sobres_VIEW (Id_Sobre, Estado_Sobre, etc.).
   */
  async consultaOrdenes(
    params: ConsultaOrdenesParams,
  ): Promise<ResultadoConsulta> {
    try {
      const config = await this.configDb.getProdubancoConfig();
      const client = await this.getClient();
      const payload = {
        strIdEmpresa: params.strIdEmpresa,
        strIdServicio: params.strIdServicio,
        estadoSobre: params.estadoSobre ?? 'TODAS',
        ordenamiento: params.ordenamiento ?? 'Fecha_Creacion_Date',
        fechaDesde: params.fechaDesde || '01012020',
        fechaHasta: params.fechaHasta || this.fechaActualDdMmYyyy(),
        idSobre: params.idSobre ?? '0',
        ip: params.ip || config.ip,
        user: params.user || config.usuario,
        referencia: params.referencia ?? '!',
        tipoConsulta: params.tipoConsulta ?? 'CashNR',
        idBuzon: params.idBuzon ?? '0',
        ultimoNumTransaccion: params.ultimoNumTransaccion ?? '0',
        numeroRegistro: params.numeroRegistro ?? '0',
      };
      this.logger.debug(
        `Invocando ConsultaOrdenes idBuzon=${payload.idBuzon} empresa=${payload.strIdEmpresa} servicio=${payload.strIdServicio}`,
      );
      const raw = await this.invocarConsultaSoap(
        client,
        'ConsultaOrdenesAsync',
        payload,
        'ConsultaOrdenesResult',
      );
      return this.parsearResultadoConsulta(
        'ConsultaOrdenes',
        raw,
        'Consulta_Sobres_VIEW',
      );
    } catch (error: unknown) {
      return this.lanzarErrorSoap('ConsultaOrdenes', error);
    }
  }

  /**
   * Consulta los movimientos (estado por ítem) de un sobre (Id_Sobre de
   * ConsultaOrdenes)[cite: 2.3.1]. Devuelve Movimientos_Out.
   */
  async consultaMovimientos(
    params: ConsultaMovimientosParams,
  ): Promise<ResultadoConsulta> {
    try {
      const config = await this.configDb.getProdubancoConfig();
      const client = await this.getClient();
      const payload = {
        strIdEmpresa: params.strIdEmpresa,
        strIdServicio: params.strIdServicio,
        strFechaDesde: params.strFechaDesde || '01012020',
        strFechaHasta: params.strFechaHasta || this.fechaActualDdMmYyyy(),
        estado: params.estado ?? 'TODOS',
        totales: params.totales ?? 'NO',
        IdSobre: params.IdSobre ?? '0',
        formaPago: params.formaPago ?? 'TODAS',
        tipoBusqueda: params.tipoBusqueda ?? 'FPM',
        estadoSobre: params.estadoSobre ?? 'TODAS',
        banco: params.banco ?? 'AMBOS',
        NumeroRegistro: params.NumeroRegistro ?? 100,
        strUsuario: params.strUsuario || config.usuario,
        strComputador: params.strComputador || config.ip,
        ultimo_NumTransaccion: params.ultimo_NumTransaccion ?? 0,
        ordenadoPor: params.ordenadoPor ?? 'FechaProcesoDate',
      };
      this.logger.debug(
        `Invocando ConsultaMovimientos IdSobre=${payload.IdSobre} empresa=${payload.strIdEmpresa} servicio=${payload.strIdServicio}`,
      );
      const raw = await this.invocarConsultaSoap(
        client,
        'ConsultaMovimientosAsync',
        payload,
        'ConsultaMovimientosResult',
      );
      return this.parsearResultadoConsulta(
        'ConsultaMovimientos',
        raw,
        'Movimientos_Out',
      );
    } catch (error: unknown) {
      return this.lanzarErrorSoap('ConsultaMovimientos', error);
    }
  }

  /**
   * Invoca un método `*Async` del cliente SOAP por nombre, con tipado fuerte
   * (el WSDL de Produbanco no declara estos métodos en los tipos de `soap`).
   */
  private async invocarConsultaSoap(
    client: soap.Client,
    metodo: string,
    args: Record<string, unknown>,
    claveResultado: string,
  ): Promise<string> {
    const registro = client as unknown as Record<string, unknown>;
    const fn = registro[metodo] as
      | ((
          a: Record<string, unknown>,
        ) => Promise<Array<Record<string, unknown>>>)
      | undefined;
    if (typeof fn !== 'function') {
      throw new RpcException({
        statusCode: 500,
        message: `Método SOAP ${metodo} no disponible en el WSDL cargado.`,
        error: 'Internal Server Error',
      });
    }
    const respuesta = (await fn.call(client, args)) as Array<
      Record<string, unknown>
    >;
    const result = respuesta?.[0];
    const valor = result?.[claveResultado];
    return typeof valor === 'string' ? valor : '';
  }
}

export interface ConsultaOrdenesParams {
  strIdEmpresa: string;
  strIdServicio: string;
  estadoSobre?: string;
  ordenamiento?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  idSobre?: string;
  ip?: string;
  user?: string;
  referencia?: string;
  tipoConsulta?: string;
  idBuzon?: string;
  ultimoNumTransaccion?: string;
  numeroRegistro?: string;
}

export interface ConsultaMovimientosParams {
  strIdEmpresa: string;
  strIdServicio: string;
  strFechaDesde?: string;
  strFechaHasta?: string;
  estado?: string;
  totales?: string;
  IdSobre?: string;
  formaPago?: string;
  tipoBusqueda?: string;
  estadoSobre?: string;
  banco?: string;
  NumeroRegistro?: number;
  strUsuario?: string;
  strComputador?: string;
  ultimo_NumTransaccion?: number;
  ordenadoPor?: string;
}

export interface ResultadoConsulta {
  sinDatos: boolean;
  registros: unknown[];
}
