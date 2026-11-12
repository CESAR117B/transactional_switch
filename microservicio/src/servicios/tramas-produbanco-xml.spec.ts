import { TramasProdubancoService } from './TramasProdubanco.service';

/** Instancia sin dependencias reales: sólo se prueba el armado de la trama. */
function crearServicio(): TramasProdubancoService {
  return new TramasProdubancoService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
}

function crearPago(detalle: Record<string, unknown> = {}) {
  return {
    cuentaEmpresa: '1234567890',
    tipoCuentaEmpresa: 'CTE',
    empresa: 'ACME & CIA',
    idEmpresa: '1',
    servicio: 'PV',
    idServicio: '75',
    referenciaLote: 'LOTE-1',
    fechaInicio: '2026-11-11',
    fechaVencimiento: '2026-11-12',
    detalles: [
      {
        tipoId: 'C',
        identificacion: '1712345678',
        nombre: 'JUAN PEREZ',
        formaPago: 'CTA',
        tipoCuenta: 'AHO',
        cuenta: '1234567890',
        bancoCodigo: '0036',
        monto: 10.5,
        referencia: 'FAC-1',
        email: 'juan@example.com',
        comprobante: 'C-1',
        ...detalle,
      },
    ],
  };
}

function obtenerLineaItem(xml: string): string {
  const match = xml.match(/<Item>(.*)<\/Item>/);
  if (!match) throw new Error('El XML no contiene un <Item>');
  return match[1];
}

describe('TramasProdubancoService.construirXmlPago', () => {
  const service = crearServicio();
  const construir = (data: unknown) =>
    (service as any).construirXmlPago(data) as string;

  it('arma un ítem con las 20 columnas del formato (19 tabuladores)', () => {
    const linea = obtenerLineaItem(construir(crearPago()));

    expect(linea.split('\t')).toHaveLength(20);
  });

  it('escapa caracteres especiales de XML', () => {
    const xml = construir(
      crearPago({ referencia: 'A&B <C> "D" \'E\'' }),
    );
    const linea = obtenerLineaItem(xml);

    expect(linea).toContain('A&amp;B &lt;C&gt; &quot;D&quot; &apos;E&apos;');
    expect(xml).toContain('<Empresa>ACME &amp; CIA</Empresa>');
  });

  it('impide inyectar tabuladores desde los campos del ítem', () => {
    const xml = construir(
      crearPago({
        identificacion: '171\t234',
        referencia: 'FAC\t1',
        comprobante: 'C\t1',
        cuenta: '123\t456',
        nombre: 'JUAN\tPEREZ',
      }),
    );
    const linea = obtenerLineaItem(xml);

    // Si un campo mete un tabulador, aparecen columnas de más.
    expect(linea.split('\t')).toHaveLength(20);
  });

  it('impide inyectar saltos de línea desde los campos del ítem', () => {
    const xml = construir(
      crearPago({
        referencia: 'FAC\n1',
        comprobante: 'C\r\n1',
      }),
    );

    expect(xml.match(/<Item>/g)).toHaveLength(1);
    expect(obtenerLineaItem(xml)).not.toMatch(/[\r\n]/);
  });

  it('trunca el nombre del beneficiario a 40 caracteres', () => {
    const nombreLargo = 'A'.repeat(100);
    const campos = obtenerLineaItem(
      construir(crearPago({ nombre: nombreLargo })),
    ).split('\t');

    expect(campos[13]).toBe('A'.repeat(40));
  });

  it('incluye la cabecera con empresa, servicio y número de registros', () => {
    const xml = construir(crearPago());

    expect(xml).toContain('<Empresa>ACME &amp; CIA</Empresa>');
    expect(xml).toContain('<Id_Servicio>75</Id_Servicio>');
    expect(xml).toContain('<NumRecs>1</NumRecs>');
    expect(xml).not.toContain('<?xml');
  });
});
