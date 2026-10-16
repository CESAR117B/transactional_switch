# IntegraciÃ³n Produbanco â€” GuÃ­a para apps cliente

Pagos a otros bancos del Ecuador y transferencias al exterior vÃ­a Produbanco
(Cash Directo), mÃ¡s consulta/listado del estado de las transacciones.

**Base URL:** `http://localhost:3000` Â· **Swagger:** `/doc` (sÃ³lo en desarrollo)

---

## 1. AutenticaciÃ³n

Todas las operaciones (excepto login) requieren un token JWT.

```http
POST /auth/login
Content-Type: application/json

{ "app_id": "tu_app_id", "app_key": "tu_app_key" }
```

Respuesta:

```json
{ "access_token": "eyJhbGciOi...", "expires_in": 3600 }
```

Luego envÃ­a el token en cada peticiÃ³n:

```http
Authorization: Bearer <access_token>
```

| CÃ³digo | Causa |
|--------|-------|
| `401` | Sin token, token invÃ¡lido o **expirado** (renueva en `/auth/login`) |
| `403` | Token vÃ¡lido, pero la app no tiene el servicio `SPR_PRODUBANCO` |
| `429` | Muchos intentos de login (mÃ¡x. 5/min por IP) |

> El token vence a la hora. RenuÃ©valo en cada expiraciÃ³n.

---

## 2. Endpoints

| MÃ©todo | Ruta | Uso |
|--------|------|-----|
| `POST` | `/tramas-produbanco/transferencia-nacional` | Pago a otros bancos nacionales |
| `POST` | `/tramas-produbanco/transferencia-internacional` | Pago al exterior (Transfer Full) |
| `GET` | `/tramas-produbanco/transacciones` | Listar transacciones (paginado) |
| `GET` | `/tramas-produbanco/transacciones/estado/:dato` | Estado en vivo por `idTransaccion` o `referenciaLote` |

> **Lo que NO se envÃ­a** (lo inyecta el back): `cuentaEmpresa`,
> `tipoCuentaEmpresa`, `empresa`, `idEmpresa` y `referenciaLote`.
> SÃ³lo se envÃ­a la data del pago.

---

## 3. Pago a banco nacional

```http
POST /tramas-produbanco/transferencia-nacional
```

```json
{
  "servicio": "PV",
  "idServicio": "75",
  "fechaInicio": "01/01/2026",
  "fechaVencimiento": "31/01/2026",
  "detalles": [
    {
      "tipoId": "C",
      "identificacion": "1723456789",
      "nombre": "Juan PÃ©rez",
      "formaPago": "SPI",
      "tipoCuenta": "CTE",
      "cuenta": "0036001234567890",
      "bancoCodigo": "0036",
      "monto": 150.75,
      "referencia": "FAC-00123",
      "email": "jperez@email.com"
    }
  ]
}
```

| Campo | Notas |
|-------|-------|
| `servicio` / `idServicio` | Obligatorios; los asigna Produbanco por operaciÃ³n (PV/75 = pago interbancario) |
| `formaPago` | `CTA` cuenta Produbanco Â· `SPI` otro banco Â· `CHQ` cheque Â· `EFE` ventanilla |
| `tipoCuenta` / `cuenta` / `bancoCodigo` | Obligatorios si `formaPago` es `CTA` o `SPI` |
| `referencia` | **Obligatoria**: nÃºmero de factura que tu sistema genera (va al banco como referencia del pago) |
| `fechaInicio` / `fechaVencimiento` | Opcionales `DD/MM/YYYY` |

**Respuesta** (`201`):

```json
{
  "exito": true,
  "idTransaccion": "21",
  "referenciaLote": "TIENDA-00001-20261016143052-a3f9",
  "envioId": "12345678",
  "totalRegistros": 1,
  "montoTotal": 150.75
}
```

`idTransaccion` y `referenciaLote` son tus llaves para consultar el estado.
La `referenciaLote` la genera el back con el formato
`NOMBREAPP-{secuencia}-{yyyyMMddHHmmss}-{4 hex}` (ej:
`TIENDA-00001-20261016143052-a3f9`). `envioId` es el identificador del sobre
en Produbanco (puede venir `"0"` si el banco no lo registra; el back consulta
igual por `referenciaLote`).

---

## 4. Transferencia al exterior

```http
POST /tramas-produbanco/transferencia-internacional
```

```json
{
  "servicio": "PE",
  "idServicio": "80",
  "fechaInicio": "12/10/2026",
  "fechaVencimiento": "18/10/2026",
  "detalles": [
    {
      "tipoId": "P",
      "identificacion": "AB123456",
      "tipoCuenta": "CTE",
      "beneficiarioNombre": "John Smith",
      "beneficiarioDireccion": "123 Main St, New York, USA",
      "beneficiarioCuenta": "DE89370400440532013000",
      "bancoDestinoNombre": "Citibank N.A.",
      "bancoDestinoDireccion": "111 Wall Street, New York, USA",
      "codigoSwiftAba": "CITIUS33",
      "monto": 1500.50,
      "motivoTransferencia": "106,0",
      "moneda": "USD",
      "tipoComision": "SHA",
      "referencia": "FAC-00456"
    }
  ]
}
```

| Campo | Notas |
|-------|-------|
| `fechaInicio` / `fechaVencimiento` | **Obligatorias** `DD/MM/YYYY` |
| `motivoTransferencia` | **Obligatoria**: `codigo,ejenciÃ³n` segÃºn catÃ¡logo SIB (ej: `106,0` = sin exenciÃ³n) |
| `codigoSwiftAba` | SWIFT/BIC o ABA del banco destino, 8â€“11 mayÃºsculas |
| `moneda` | ISO-3, default `USD` |
| `tipoComision` | `OUR` ordenante Â· `BEN` beneficiario Â· `SHA` compartida |
| `referencia` | Opcional (mÃ¡x. 50); si falta, el back usa la `referenciaLote` generada |

Misma respuesta que el pago nacional. Requiere **habilitaciÃ³n por contrato**
con Produbanco para transferencias al exterior.

---

## 5. Listar transacciones

```http
GET /tramas-produbanco/transacciones?page=1&pageSize=20&status=1&operation=SPR_PRODUBANCO-PAGO
```

Todos los query params son opcionales (`page=1`, `pageSize=20` mÃ¡x. 50,
`status` 1/2/3, `operation` pago o transferencia). SÃ³lo muestra operaciones de
Produbanco de **tu app**.

```json
{
  "page": 1,
  "pageSize": 20,
  "total": 3,
  "totalPages": 1,
  "items": [
    {
      "idTransaccion": "21",
      "referenciaLote": "TIENDA-00001-20261016143052-a3f9",
      "operacion": "SPR_PRODUBANCO-PAGO",
      "status": 2,
      "statusServicio": "PROCESADO_BANCO",
      "estadoTransaccion": "APROBADO",
      "codigoBanco": null,
      "mensajeBanco": null,
      "fechaConsultaBanco": "15/10/2026 10:30:00",
      "envioId": "12345678",
      "errorMessage": null,
      "fechaCreacion": "2026-10-15T10:00:00.000Z",
      "registros": 1,
      "montoTotal": 150.75,
      "estadosDetalle": { "APROBADO": 1 }
    }
  ]
}
```

---

## 6. Estado de una transacciÃ³n

```http
GET /tramas-produbanco/transacciones/estado/21
GET /tramas-produbanco/transacciones/estado/TIENDA-00001-20261016143052-a3f9
```

`/estado/:dato` acepta **un** valor: `idTransaccion` o `referenciaLote`.
Consulta el estado **en vivo** en Produbanco, actualiza la BD y responde:

```json
{
  "idTransaccion": "21",
  "referenciaLote": "TIENDA-00001-20261016143052-a3f9",
  "operacion": "SPR_PRODUBANCO-PAGO",
  "status": 2,
  "statusServicio": "PROCESADO_BANCO",
  "estadoTransaccion": "APROBADO",
  "codigoBanco": "0000",
  "mensajeBanco": "CONSULTA EXITOSA",
  "fechaConsultaBanco": "16/10/2026 09:15:00",
  "cargaRespuestaBanco": "<xml crudo de la carga...>",
  "envioId": "12345678",
  "errorMessage": null,
  "fechaCreacion": "2026-10-15T10:00:00.000Z",
  "totales": { "registros": 1, "montoTotal": 150.75 },
  "detalles": [
    {
      "secuencia": 1,
      "tipoId": "C",
      "identificacion": "1723456789",
      "nombre": "Juan PÃ©rez",
      "cuenta": "0036001234567890",
      "bancoCodigo": "0036",
      "formaPago": "SPI",
      "monto": 150.75,
      "moneda": "USD",
      "referenciaDocumento": "FAC-00123",
      "estadoItem": "APROBADO",
      "codigoRespuesta": "0000",
      "mensajeBanco": "PAGO PROCESADO"
    }
  ],
  "banco": {
    "consultado": true,
    "sinDatos": false,
    "consultaPor": "envioId",
    "codigo": "0000",
    "mensaje": "CONSULTA EXITOSA",
    "orden": { "...": "sobre del banco" },
    "movimientos": []
  }
}
```

### CÃ³mo leer los estados

| Campo | Significado |
|-------|-------------|
| `status` (local) | Estado interno del back: `1` PENDIENTE (en proceso), `2` PROCESADO_BANCO, `3` ERROR |
| `statusServicio` | Resumen legible del estado local (`PENDIENTE` / `PROCESADO_BANCO` / `ERROR`) |
| `estadoTransaccion` | **Estado verbatim de Produbanco** (ej: `ACTIVO`, `APROBADO`, `REVOCADO`) â€” no estÃ¡ mapeado; usa tal cual |
| `estadoItem` (detalle) | Estado verbatim por pago dentro del lote |
| `banco.consultaPor` | CÃ³mo buscÃ³ el banco la orden: `envioId` o `referencia` |
| `banco.sinDatos` | `true` = el banco aÃºn no tiene la orden (`codigo` `0005`) |

Un fallo de consulta **no** rompe la respuesta: se reporta en `banco.error` y
los datos locales siguen siendo vÃ¡lidos.

---

## 7. Errores de la carga al banco

Si Produbanco rechaza la trama o hay error de red, el back guarda el lote en
`ERROR` y devuelve el error con la respuesta cruda del banco:

```json
{ "message": "Trama invÃ¡lida", "respuestaBanco": "<respuesta cruda del SOAP>" }
```

---

## 8. Idempotencia (importante)

El back detecta **lotes con contenido idÃ©ntico** (mismo pago, mismo monto,
mismos beneficiarios):

- Si el lote anterior terminÃ³ en `ERROR`: se **recicla automÃ¡ticamente**
  (reenvÃ­a al banco y responde normal).
- Si estÃ¡ `PENDIENTE` o `PROCESADO_BANCO`: responde `409 Conflict` â€” para
  reenviar el mismo pago usa **nuevos datos** (ej: nueva `referencia`).

El login fallido y las claves de las apps se manejan en la BD del back; la
documentaciÃ³n Swagger en `/doc` refleja siempre los DTOs vigentes.
