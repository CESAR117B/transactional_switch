# Integración Produbanco — Guía para apps cliente

Pagos a otros bancos del Ecuador y transferencias al exterior ví­a Produbanco
(Cash Directo), mÃ¡s consulta/listado del estado de las transacciones.

**Base URL:** `http://localhost:3000` · **Swagger:** `/doc` (solo en desarrollo)

---

## 1. Autenticación

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

Luego envía el token en cada petición:

```http
Authorization: Bearer <access_token>
```

| Código | Causa |
|--------|-------|
| `401` | Sin token, token inválido o **expirado** (renueva en `/auth/login`) |
| `403` | Token válido, pero la app no tiene el servicio `SPR_PRODUBANCO` |
| `429` | Muchos intentos de login (máx. 5/min por IP) |

> El token vence a la hora. Renuévalo en cada expiración.

### Encryption key (segundo factor para consultar data)

Los endpoints de **consulta** de data encriptada (`GET /transacciones` y
`GET /transacciones/estado/:dato`) exigen, **además del JWT**, enviar la
`encryptionKey` de tu app en el header `X-Encryption-Key` (32 caracteres).

- Tu app recibe tres credenciales: `identificador_app` (identificación),
  `key` (para autenticarte en `/auth/login`) y `encryptionKey` (para ver la
  data encriptada).
- El back **valida** que la llave enviada coincida con la registrada y la usa
  para desencriptar la respuesta. Un JWT válido **sin** la `encryptionKey` no
  obtiene data en claro.
- Recomendable sobre **TLS**: la llave viaja en cada petición.

| Código | Causa |
|--------|-------|
| `400` | Falta el header `X-Encryption-Key`, está vacío o no tiene 32 caracteres |
| `401` | La llave no coincide con la `encryptionKey` registrada de la app |
| `500` | La app no tiene `encryptionKey` configurada en el back |

Las operaciones de **carga** (`transferencia-nacional` /
`transferencia-internacional`) no requieren este header: el back las encripta
con la llave registrada.

---

## 2. Endpoints

| Método | Ruta | Uso |
|--------|------|-----|
| `POST` | `/tramas-produbanco/transferencia-nacional` | Pago a otros bancos nacionales |
| `POST` | `/tramas-produbanco/transferencia-internacional` | Pago al exterior (Transfer Full) |
| `GET` | `/tramas-produbanco/transacciones` | Listar transacciones (paginado) |
| `GET` | `/tramas-produbanco/transacciones/estado/:dato` | Estado en vivo por `idTransaccion` o `referenciaLote` |

> **Lo que NO se envía** (lo inyecta el back): `cuentaEmpresa`,
> `tipoCuentaEmpresa`, `empresa`, `idEmpresa` y `referenciaLote`.
> Sólo se envía la data del pago.

---

## 3. Pago a banco nacional

```http
POST /tramas-produbanco/transferencia-nacional
```

```json
{
  "servicio": "PV",
  "idServicio": "75",
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
| `servicio` / `idServicio` | Obligatorios; los asigna Produbanco por operación (PV/75 = pago interbancario) |
| `formaPago` | `CTA` cuenta Produbanco · `SPI` otro banco · `CHQ` cheque · `EFE` ventanilla |
| `tipoCuenta` / `cuenta` / `bancoCodigo` | Obligatorios si `formaPago` es `CTA` o `SPI` |
| `referencia` | **Obligatoria**: número de factura que tu sistema genera (va al banco como referencia del pago) |
| `fechaInicio` / `fechaVencimiento` | **No se envían**: el microservicio genera la vigencia del sobre automáticamente (hoy → hoy + 1) y la incluye en la trama al banco |

**Respuesta** (`201`):

```json
{
  "referenciaLote": "OWFiYzoxYWJjZGVm[…]",
  "montoTotal": 150.75
}
```

> **`referenciaLote` viene ENRIPTADA** con la `encryptionKey` de tu app (no la
> desencripta el back al responder): guárdala tal cual en tu base de datos y
> desencripta tú localmente cuando la necesites en claro. Su formato en claro
> es `NOMBREAPP-{secuencia}-{yyyyMMddHHmmss}-{4 hex}` (ej:
> `TIENDA-00001-20261016143052-a3f9`) y su valor cifrado es
> `IV:AuthTag:Texto` (base64 separado por `:`).

> **Ya NO se devuelven** `exito`, `idTransaccion`, `envioId` ni
> `totalRegistros`: la respuesta se limita a `referenciaLote` y
> `montoTotal`. Para obtener `idTransaccion` y `envioId` consulta el listado
> (sección 5) o el estado (sección 6) — esos sí los incluyen.

> **Anti-duplicado (`429`):** se rechaza la transacción si la misma app ya
> envió una con el **mismo monto a la misma cuenta beneficiario** dentro de
> los últimos **5 minutos**. Si la transacción previa terminó en error se
> permite reintentar. Aplica igual en el pago nacional y en el exterior.

---

## 4. Transferencia al exterior

```http
POST /tramas-produbanco/transferencia-internacional
```

```json
{
  "servicio": "PE",
  "idServicio": "80",
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
| `fechaInicio` / `fechaVencimiento` | **No se envían**: el microservicio genera la vigencia del sobre automáticamente (hoy → hoy + 1) y la incluye en la trama al banco |
| `motivoTransferencia` | **Obligatoria**: `codigo,ejención` según catalogo SIB (ej: `106,0` = sin exención) |
| `codigoSwiftAba` | SWIFT/BIC o ABA del banco destino, 8â€“11 mayusculas |
| `moneda` | ISO-3, default `USD` |
| `tipoComision` | `OUR` ordenante Â· `BEN` beneficiario Â· `SHA` compartida |
| `referencia` | Opcional (mÃ¡x. 50); si falta, el back usa la `referenciaLote` generada |

Misma respuesta que el pago nacional. Requiere **habilitación por contrato**
con Produbanco para transferencias al exterior. El límite anti-duplicado de
5 minutos (`429`) también aplica aquí (mismo monto + misma cuenta
beneficiario).

---

## 5. Listar transacciones

```http
GET /tramas-produbanco/transacciones?page=1&pageSize=20&status=1&operation=SPR_PRODUBANCO-PAGO
X-Encryption-Key: <encryptionKey de tu app>
```

> **Header `X-Encryption-Key` obligatorio** (ver sección 1). Sin él → `400`;
> con una llave distinta a la registrada → `401`. En **esta** respuesta la
> data sensible (`referenciaLote`, `beneficiarioIdentificacion`,
> `beneficiarioCuenta`) viene **desencriptada** — el back usa tu llave antes
> de responder (a diferencia de la carga, sección 3, que la devuelve cifrada).

Todos los query params son opcionales (`page=1`, `pageSize=20` max. 50,
`status` 1/2/3, `operation` pago o transferencia). Solo muestra operaciones de
Produbanco de **tu app**.

### Filtros de búsqueda

| Parámetro | Ejemplo | Comportamiento |
|-----------|---------|----------------|
| `fechaDesde` / `fechaHasta` | `?fechaDesde=01/10/2026&fechaHasta=19/10/2026` | Formato `DD/MM/YYYY`, rango **inclusivo** de día completo en **horario Ecuador** (UTC-5). `400` si el formato es inválido, la fecha no existe (ej: `31/02`) o `fechaDesde > fechaHasta` |
| `cedula` | `?cedula=1723456789` | Match **exacto normalizado** (sin espacios ni guiones, mayúsculas): `04018 85397` también coincide con `0401885397` |
| `cuenta` | `?cuenta=DE89370400440532013000` | Ídem exacto normalizado: un IBAN con espacios (`DE89 3704...`) también coincide |

- `cedula` y `cuenta` devuelven los **lotes que contienen ese beneficiario**;
  si envías ambos, deben estar en el **mismo detalle** del lote (AND).
- Todos los filtros se **combinan** entre sí y con `status`/`operation`.
- Ejemplo completo: `?cedula=1723456789&fechaDesde=01/10/2026&fechaHasta=19/10/2026&page=1`.

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
      "beneficiarioIdentificacion": "1723456789",
      "beneficiarioCuenta": "0036001234567890",
      "registros": 1,
      "montoTotal": 150.75,
      "estadosDetalle": { "APROBADO": 1 }
    }
  ]
}
```

---

## 6. Estado de una transacción

```http
GET /tramas-produbanco/transacciones/estado/21
X-Encryption-Key: <encryptionKey de tu app>
```

> **Header `X-Encryption-Key` obligatorio** (ver sección 1). Sin él → `400`;
> con una llave distinta a la registrada → `401`. La app cliente debe
> desencriptar localmente la `referenciaLote` que le devolvió la carga
> (sección 3) y usarla **en claro** como `:dato` para buscar por referencia.
> La respuesta, como en el listado, viene **desencriptada**.

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

### Cómo leer los estados

| Campo | Significado |
|-------|-------------|
| `status` (local) | Estado interno del back: `1` PENDIENTE (en proceso), `2` PROCESADO_BANCO, `3` ERROR |
| `statusServicio` | Resumen legible del estado local (`PENDIENTE` / `PROCESADO_BANCO` / `ERROR`) |
| `estadoTransaccion` | **Estado verbatim de Produbanco** (ej: `ACTIVO`, `APROBADO`, `REVOCADO`) — no está mapeado; usa tal cual |
| `estadoItem` (detalle) | Estado verbatim por pago dentro del lote |
| `banco.consultaPor` | Cómo buscó el banco la orden: `envioId` o `referencia` |
| `banco.sinDatos` | `true` = el banco aún no tiene la orden (`codigo` `0005`) |

Un fallo de consulta **no** rompe la respuesta: se reporta en `banco.error` y
los datos locales siguen siendo válidos.

---

## 7. Errores de la carga al banco

Si Produbanco rechaza la trama o hay error de red, el back guarda el lote en
`ERROR` y devuelve el error con la respuesta cruda del banco:

```json
{ "message": "Trama inválida", "respuestaBanco": "<respuesta cruda del SOAP>" }
```

---

## 8. Idempotencia (importante)

El back detecta **lotes con contenido idéntico** (mismo pago, mismo monto,
mismos beneficiarios):

- Si el lote anterior terminó en `ERROR`: se **recicla automáticamente**
  (reenvía al banco y responde normal).
- Si está `PENDIENTE` o `PROCESADO_BANCO`: responde `409 Conflict` — para
  reenviar el mismo pago usa **nuevos datos** (ej: nueva `referencia`).

El login fallido y las claves de las apps se manejan en la BD del back; la
documentación Swagger en `/doc` refleja siempre los DTOs vigentes.
