/**
 * Diagnóstico de trama CargaDirectaXml contra Produbanco (ambiente testing).
 *
 * Prueba variantes de la trama <Envelope> (Manual Técnico Cash Directo §2.2.1)
 * y DETIENE el proceso en la primera que el banco acepta con VALIDADO y un
 * Envio_Id real. Imprime el <Estado>/<MensajeRespuesta> crudo de cada una.
 *
 * IMPORTANTE: cada variante aceptada CREA UNA ORDEN REAL de prueba en el
 * ambiente de testing de Produbanco (no usar contra producción).
 *
 * Uso (desde microservicio/):
 *   npx ts-node -r tsconfig-paths/register scripts/diagnosticar-trama.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ConfigDbService } from '../src/config-db/config-db.service';
import { ProdubancoSoapService } from '../src/Integraciones/ProdubancoSoap.service';

// Payload de prueba: idéntico al último POST /pago del usuario (tx 20).
const CUENTA_EMPRESA = '12040640308';
const TIPO_CUENTA_EMPRESA = 'CTE';
const REFERENCIA_LARGA = 'SHOPBYSOCIAL-00009-20261015202617-99fa'; // 37 chars
const REFERENCIA_CORTA = 'CARGA TEST 1';
const FECHA_INICIO = '15/10/2026';
const FECHA_VENCIMIENTO = '16/10/2026';

function escapeXml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Item 20 campos (F1-F20 del Formato ENTRADA PAGOS_FULL) unidos por TAB. */
function itemLinea(completo: boolean): string {
  const campos = [
    'PA', // 1  Código Orientación
    CUENTA_EMPRESA, // 2  Cuenta Empresa (11)
    '1', // 3  Secuencial
    '1626', // 4  Comprobante
    '02002000123', // 5  Contrapartida (cuenta beneficiario CTA)
    'USD', // 6  Moneda
    '0000000001000', // 7  Valor 10.00 en 13 dígitos
    'CTA', // 8  Forma de Pago
    '0036', // 9  Institución (Produbanco)
    'CTE', // 10 Tipo de Cuenta
    '02002000123', // 11 Número de Cuenta beneficiario
    'R', // 12 Tipo ID
    '17035258901', // 13 Número ID
    'MARCO CRESPO', // 14 Nombre
    ...(completo
      ? ['', '', '', ''] // 15-18 Dirección/Ciudad/Teléfono/Localidad (blancos)
      : []),
    'FACT 1155-1157', // 19 Referencia
    '|mcrespo@ejemplo.net', // 20 Referencia adicional (email)
  ];
  return campos.map(escapeXml).join('\t');
}

function armarTrama(empresa: string, idEmpresa: string, opciones: {
  conDeclaracionXml: boolean;
  referencia: string;
  itemCompleto: boolean;
}): string {
  const item = `<Item>${itemLinea(opciones.itemCompleto)}</Item>`;
  const cuerpo = `<Envelope>
  <Empresa>${escapeXml(empresa)}</Empresa>
  <Id_Empresa>${escapeXml(idEmpresa)}</Id_Empresa>
  <Servicio>PV</Servicio>
  <Id_Servicio>75</Id_Servicio>
  <TipoCuenta>${TIPO_CUENTA_EMPRESA}</TipoCuenta>
  <NumeroCuenta>${CUENTA_EMPRESA}</NumeroCuenta>
  <Referencia>${escapeXml(opciones.referencia)}</Referencia>
  <FechaInicio>${FECHA_INICIO}</FechaInicio>
  <FechaVencimiento>${FECHA_VENCIMIENTO}</FechaVencimiento>
  <Cabecera></Cabecera>
${item}
  <NumRecs>1</NumRecs>
</Envelope>`;
  return opciones.conDeclaracionXml
    ? `<?xml version="1.0" encoding="utf-8"?>\n${cuerpo}`
    : cuerpo;
}

function resumen(xml: string): string {
  const estado = xml.match(/<Estado>([^<]*)<\/Estado>/)?.[1]?.trim() ?? 'N/A';
  const mensaje =
    xml.match(/<MensajeRespuesta>([^<]*)<\/MensajeRespuesta>/)?.[1]?.trim() ??
    'N/A';
  const envioId = xml.match(/<Envio_Id>(\d+)<\/Envio_Id>/)?.[1] ?? 'N/A';
  return `estado=${estado} envioId=${envioId} mensaje="${mensaje}"`;
}

function esExito(xml: string): boolean {
  const estado = xml.match(/<Estado>([^<]*)<\/Estado>/)?.[1]?.trim();
  const envioId = xml.match(/<Envio_Id>(\d+)<\/Envio_Id>/)?.[1];
  return estado === 'VALIDADO' && !!envioId && envioId !== '0';
}

async function probarConServicio(
  soapSvc: ProdubancoSoapService,
  etiqueta: string,
  xml: string,
): Promise<boolean> {
  try {
    const trama = await soapSvc.autenticarYEncriptar(xml);
    const res = await soapSvc.cargarDirectaXml(trama);
    console.log(`  [${etiqueta}] ${resumen(res.respuesta)}`);
    return esExito(res.respuesta);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`  [${etiqueta}] ERROR: ${msg}`);
    return false;
  }
}

/** Decodifica las entidades XML de un resultado SOAP escapado. */
function decodificar(xml: string): string {
  return xml
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Variante V4: igual a V1 pero con POST crudo y trama dentro de CDATA. */
async function probarCdata(
  config: { ip: string; usuario: string; empresa: string; wsdl_url: string },
  xml: string,
): Promise<boolean> {
  try {
    const endpoint = config.wsdl_url.replace(/\?wsdl$/i, '');
    const ns = `${new URL(endpoint).origin}/easycashdirecto`;
    const envelope = (metodo: string, args: string) =>
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"` +
      ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">` +
      `<soap:Body><${metodo} xmlns="${ns}">${args}</${metodo}></soap:Body></soap:Envelope>`;

    const post = async (metodo: string, args: string): Promise<string> => {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: `"${ns}/${metodo}"`,
        },
        body: envelope(metodo, args),
      });
      const texto = await r.text();
      const m = texto.match(
        new RegExp(`<${metodo}Result>([\\s\\S]*?)</${metodo}Result>`),
      );
      return decodificar(m?.[1] ?? texto.slice(0, 400));
    };

    const encriptado = await post(
      'DevuelveXmlEncriptado',
      `<strXmlInput><![CDATA[${xml}]]></strXmlInput>` +
        `<strUsuario>${config.usuario}</strUsuario>` +
        `<strComputador>${config.ip}</strComputador>` +
        `<Empresa>${config.empresa}</Empresa>`,
    );
    const sep = encriptado.indexOf('|');
    if (sep === -1) {
      console.log(`  [V4 CDATA] DevuelveXmlEncriptado inesperado: ${encriptado.slice(0, 160)}`);
      return false;
    }
    const respuesta = await post(
      'CargaDirectaXml',
      `<strXmlInput>${encriptado.substring(sep + 1).trim()}</strXmlInput>` +
        `<strUsuario>${config.usuario}</strUsuario>` +
        `<strComputador>${config.ip}</strComputador>` +
        `<Empresa>${config.empresa}</Empresa>`,
    );
    console.log(`  [V4 CDATA] ${resumen(respuesta)}`);
    return esExito(respuesta);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`  [V4 CDATA] ERROR: ${msg}`);
    return false;
  }
}

async function main() {
  const ctx = await NestFactory.createApplicationContext(AppModule);
  const soapSvc = ctx.get(ProdubancoSoapService);
  const configDb = ctx.get(ConfigDbService);
  const config = await configDb.getProdubancoConfig();

  console.log('=== Diagnóstico de trama CargaDirectaXml (Produbanco testing) ===');
  console.log(`empresa(soap)=${config.empresa} usuario=${config.usuario} ip=${config.ip}`);

  // Id_Empresa del último payload del usuario (24672); el nombre de empresa
  // se toma de la config para que coincida con el parámetro de autenticación.
  const idEmpresa = '24672';
  const empresa = config.empresa;

  const variantes: Array<[string, string]> = [
    ['V0 actual (declaración + ref larga)', armarTrama(empresa, idEmpresa, { conDeclaracionXml: true, referencia: REFERENCIA_LARGA, itemCompleto: true })],
    ['V1 sin declaración XML', armarTrama(empresa, idEmpresa, { conDeclaracionXml: false, referencia: REFERENCIA_LARGA, itemCompleto: true })],
    ['V2 sin declaración + ref corta', armarTrama(empresa, idEmpresa, { conDeclaracionXml: false, referencia: REFERENCIA_CORTA, itemCompleto: true })],
    ['V3 sin declaración + item 16 campos', armarTrama(empresa, idEmpresa, { conDeclaracionXml: false, referencia: REFERENCIA_LARGA, itemCompleto: false })],
  ];

  let ganadora: string | null = null;
  for (const [etiqueta, xml] of variantes) {
    console.log(`\nProbando ${etiqueta} ...`);
    const ok = await probarConServicio(soapSvc, etiqueta, xml);
    if (ok) {
      ganadora = etiqueta;
      break;
    }
  }

  if (!ganadora) {
    console.log('\nProbando V4 (CDATA) ...');
    const ok = await probarCdata(
      config,
      armarTrama(empresa, idEmpresa, { conDeclaracionXml: false, referencia: REFERENCIA_LARGA, itemCompleto: true }),
    );
    if (ok) ganadora = 'V4 CDATA';
  }

  console.log(
    ganadora
      ? `\n=== GANADORA: ${ganadora} ===\nAplicar esta forma en construirXmlPago/construirXmlTransferencia.`
      : '\n=== NINGUNA variante fue aceptada ===\nRevisar mensajes: si todos dicen "Trama inválida", escalar a Produbanco con el XML enviado.',
  );

  await ctx.close();
}

main().catch((error) => {
  console.error('Fallo del diagnóstico:', error);
  process.exitCode = 1;
});
