import { UniversalCryptoService } from '../servicios/universal-crypto.service';
import { hashBusqueda } from '../servicios/hash-busqueda';
import {
  cifrarPayloadPago,
  mapearDetalle,
  normalizarDetallePago,
  normalizarDetalleTransferencia,
  parametrizarPago,
} from './detalle.mapper';

const SECRET = 'k'.repeat(32);
const crypto = new UniversalCryptoService();
const fechas = {
  fechaInicioDate: new Date('2026-11-12T00:00:00.000Z'),
  fechaFinDate: new Date('2026-11-13T00:00:00.000Z'),
};

describe('detalle.mapper', () => {
  it('normaliza la cuenta de banco de un pago CTA al código 0036', () => {
    const detalle = normalizarDetallePago({
      tipoId: 'C',
      identificacion: '1712345678',
      nombre: 'JUAN PEREZ',
      formaPago: 'CTA',
      tipoCuenta: 'AHO',
      cuenta: '1234567890',
      bancoCodigo: '9999',
      monto: 10,
      referencia: 'FAC-1',
    } as any);

    expect(detalle.bancoCodigo).toBe('0036');
    expect(detalle.moneda).toBe('USD');
    expect(detalle.codigoExoneracionIsd).toBeNull();
  });

  it('normaliza una transferencia con SWIFT y moneda por defecto', () => {
    const detalle = normalizarDetalleTransferencia({
      tipoId: 'C',
      identificacion: '1712345678',
      beneficiarioNombre: 'JUAN PEREZ',
      beneficiarioCuenta: '1234567890',
      codigoSwiftAba: 'ABCDEFGHIJKL',
      monto: 10,
    } as any);

    expect(detalle.bancoCodigo).toBe('ABCDEFGHIJ');
    expect(detalle.moneda).toBe('USD');
    expect(detalle.formaPago).toBe('SPI');
    expect(detalle.codigoExoneracionIsd).toBe('0');
  });

  it('cifra identificación/cuenta y calcula los hashes de búsqueda', () => {
    const detalle = normalizarDetallePago({
      tipoId: 'C',
      identificacion: '1712345678',
      nombre: 'JUAN PEREZ',
      formaPago: 'CTA',
      tipoCuenta: 'AHO',
      cuenta: '1234567890',
      bancoCodigo: '0036',
      monto: 10,
      referencia: 'FAC-1',
    } as any);

    const mapeado = mapearDetalle(detalle, 1, SECRET, fechas, crypto);

    expect(mapeado.beneficiarioIdentificacion).not.toBe('1712345678');
    expect(crypto.decrypt(mapeado.beneficiarioIdentificacion, SECRET)).toBe(
      '1712345678',
    );
    expect(mapeado.beneficiarioCuenta).not.toBe('1234567890');
    expect(mapeado.beneficiarioIdentificacionHash).toBe(
      hashBusqueda('1712345678', SECRET),
    );
    expect(mapeado.beneficiarioCuentaHash).toBe(
      hashBusqueda('1234567890', SECRET),
    );
    expect(mapeado.fechaInicio).toBe(fechas.fechaInicioDate);
    expect(mapeado.estadoItem).toBe('PENDIENTE');
  });

  it('parametriza el pago con la configuración bancaria y las fechas', () => {
    const datos = parametrizarPago(
      { servicio: 'PV', idServicio: '75', detalles: [] } as any,
      {
        numerocuenta: '1234567890',
        tipocuenta: 'CTE',
        empresa: 'ACME',
        idempresa: '1',
      },
      {
        ...fechas,
        fechaInicio: '12/11/2026',
        fechaVencimiento: '13/11/2026',
      },
    );

    expect(datos).toMatchObject({
      cuentaEmpresa: '1234567890',
      tipoCuentaEmpresa: 'CTE',
      empresa: 'ACME',
      idEmpresa: '1',
      fechaInicio: '12/11/2026',
      fechaVencimiento: '13/11/2026',
      fechaInicioDate: fechas.fechaInicioDate,
      fechaFinDate: fechas.fechaFinDate,
    });
  });

  it('cifra cuentaEmpresa y los detalles en el payload de auditoría', () => {
    const data = parametrizarPago(
      {
        servicio: 'PV',
        idServicio: '75',
        detalles: [
          {
            tipoId: 'C',
            identificacion: '1712345678',
            nombre: 'JUAN',
            formaPago: 'CTA',
            tipoCuenta: 'AHO',
            cuenta: '1234567890',
            monto: 5,
            referencia: 'F',
          },
        ],
      } as any,
      {
        numerocuenta: '1234567890',
        tipocuenta: 'CTE',
        empresa: 'ACME',
        idempresa: '1',
      },
      {
        ...fechas,
        fechaInicio: '12/11/2026',
        fechaVencimiento: '13/11/2026',
      },
    );
    data.referenciaLote = 'LOTE-1';

    const payload = cifrarPayloadPago(data, 'ref-cifrada', SECRET, crypto);

    expect(payload.cuentaEmpresa).not.toBe('1234567890');
    expect(payload.referenciaLote).toBe('ref-cifrada');
    expect(payload.detalles[0].identificacion).not.toBe('1712345678');
    expect(payload.detalles[0].cuenta).not.toBe('1234567890');
  });
});
