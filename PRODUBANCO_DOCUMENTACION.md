# Integración Produbanco — Guía para apps cliente

Pagos a otros bancos del Ecuador y transferencias al exterior ví­a Produbanco
(Cash Directo), más consulta/listado del estado de las transacciones.

**Base URL:** `http://localhost:3000` · **Swagger:** `/doc` (`ENABLE_SWAGGER`, activo por defecto)

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
| `GET` | `/tramas-produbanco/transacciones/estado/:dato` | Estado en vivo por `referenciaLote` (cifrada o en claro) |

> **Lo que NO se envía** (lo inyecta el back): `cuentaEmpresa`,
> `tipoCuentaEmpresa`, `empresa`, `idEmpresa` y `referenciaLote`.
> Sólo se envía la data del pago.

La app cliente **no** recibe `idTransaccion` ni los demás campos internos: su
identificador de operación es `referenciaLote`. La consulta administrativa
(`/admin/produbanco/...`, sección 9) devuelve la misma respuesta más esos
campos internos.

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
      "nombre": "Juan Pérez",
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
> `montoTotal`. Para obtener `envioId` consulta el listado (sección 5) o el
> estado (sección 6) — esos sí lo incluyen.
>
> **`idTransaccion` no se expone a la app cliente**: es un identificador
> interno que sólo ve la consulta administrativa (sección 9). Guarda la
> `referenciaLote` y úsala como identificador de la operación y como `:dato`
> en la consulta de estado.

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
| `codigoSwiftAba` | SWIFT/BIC o ABA del banco destino, 8–11 mayusculas |
| `moneda` | ISO-3, default `USD` |
| `tipoComision` | `OUR` ordenante · `BEN` beneficiario · `SHA` compartida |
| `referencia` | Opcional (máx. 50); si falta, el back usa la `referenciaLote` generada |

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
`status` 1/2/3/4, `operation` pago o transferencia). Solo muestra operaciones de
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
      "referenciaLote": "TIENDA-00001-20261016143052-a3f9",
      "statusServicio": "PROCESADO_BANCO",
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
      "entregados": 0,
      "entregaEfectiva": false,
      "estadosDetalle": { "Pendiente de envio por el banco": 1 }
    }
  ]
}
```

> **Campos que NO se devuelven a la app cliente:** `idTransaccion`,
> `operacion`, `status`, `estadoTransaccion`. Son internos y sólo aparecen en
> la consulta administrativa (sección 9). El identificador de la operación
> para el cliente es `referenciaLote`, y el único indicador de estado de
> cabecera es `statusServicio` (ver sección 6).

> El filtro `status` de la query sí sigue disponible aunque el campo no se
> muestre en la respuesta: sirve para pedir sólo lotes en un estado
> determinado.

---

## 6. Estado de una transacción

```http
GET /tramas-produbanco/transacciones/estado/TIENDA-00001-20261016143052-a3f9
X-Encryption-Key: <encryptionKey de tu app>
```

> **Header `X-Encryption-Key` obligatorio** (ver sección 1). Sin él → `400`;
> con una llave distinta a la registrada → `401`. La respuesta, como en el
> listado, viene **desencriptada**.

`/estado/:dato` acepta **un** valor:

- `referenciaLote` **cifrada**, tal cual la devolvió la carga (sección 3). Al
  contener `/`, `:` y `=`, hay que enviarla **URL-encoded**.
- `referenciaLote` **en claro** (`TIENDA-00001-20261016143052-a3f9`), por
  ejemplo la que devuelve el listado.
- `idTransaccion`, sólo si lo tienes de una fuente interna: la app cliente no
  lo recibe en ninguna respuesta.

Consulta el estado **en vivo** en Produbanco, actualiza la BD y responde con
el resumen persistido. **No** incluye el detalle crudo del banco
(`orden`/`movimientos` SOAP): ese detalle solo está disponible en la consulta
administrativa (`/admin/produbanco/transacciones/estado/:dato`, sección 9).

```json
{
  "referenciaLote": "TIENDA-00001-20261016143052-a3f9",
  "statusServicio": "PROCESADO_BANCO",
  "codigoBanco": "0000",
  "mensajeBanco": "CONSULTA EXITOSA",
  "fechaConsultaBanco": "16/10/2026 09:15:00",
  "envioId": "12345678",
  "errorMessage": null,
  "fechaCreacion": "2026-10-15T10:00:00.000Z",
  "totales": {
    "registros": 1,
    "montoTotal": 150.75,
    "entregados": 1,
    "entregaEfectiva": true
  },
  "detalles": [
    {
      "secuencia": 1,
      "tipoId": "C",
      "identificacion": "1723456789",
      "nombre": "Juan Pérez",
      "cuenta": "0036001234567890",
      "bancoCodigo": "0036",
      "formaPago": "SPI",
      "monto": 150.75,
      "moneda": "USD",
      "referenciaDocumento": "FAC-00123",
      "estadoItem": "ENTREGADO OK",
      "entregaEfectiva": true,
      "codigoRespuesta": "0000",
      "mensajeBanco": "PAGO PROCESADO"
    }
  ]
}
```

> **Campos que NO se devuelven a la app cliente:** `idTransaccion`,
> `operacion`, `status`, `estadoTransaccion` y `cargaRespuestaBanco`. Son
> internos y sólo aparecen en la consulta administrativa (sección 9). El
> mismo criterio aplica al listado (sección 5).

### Cómo leer los estados

Para la app cliente, el **único** indicador de estado de la cabecera es
`statusServicio`:

| `statusServicio` | Significado | Qué hacer |
|---|---|---|
| `PENDIENTE` | Enviada, aún sin respuesta definitiva del banco | Consultar más tarde; **no** reenviar |
| `PROCESADO_BANCO` | **La operación fue procesada por el banco** | Éxito del lote: revisar `detalles[]` |
| `INCIERTO` | No se pudo confirmar (timeout, corte, respuesta incompleta) | Volver a consultar; **no** reenviar con llave nueva |
| `ERROR` | El banco o la validación rechazaron la operación | Revisar `errorMessage`, `codigoBanco` / `mensajeBanco` |
| `DESCONOCIDO` | Estado no mapeado (dato legado) | Tratar como `INCIERTO` y consultar |

```text
statusServicio === "PROCESADO_BANCO"                       → operación exitosa
statusServicio === "PENDIENTE" | "INCIERTO" | "DESCONOCIDO" → volver a consultar
statusServicio === "ERROR"                                 → falló; no reintentar sin corregir
```

> `PROCESADO_BANCO` indica que el **lote** fue procesado. El resultado de cada
> pago está en `detalles[].estadoItem` y `detalles[].entregaEfectiva`, porque
> un lote puede procesarse con ítems entregados y otros rechazados.

Otros campos públicos:

| Campo | Significado |
|-------|-------------|
| `estadoItem` (detalle) | Estado **verbatim de Produbanco** por pago dentro del lote (`Pendiente de envio por el banco`, `Aplica al banco`, `PROCESO OK`, `ENTREGADO OK`, `PROCESADAS ERROR`, ...). Se devuelve sin interpretar. |
| `codigoBanco` / `mensajeBanco` | Último código/mensaje de la consulta al banco (`0005` = aún sin datos) |
| `envioId` | Identificador del sobre en Produbanco, para trazabilidad |

### Entrega efectiva del dinero

Para no obligar al cliente a interpretar la redacción del banco, cada ítem
incluye un booleano calculado:

| Campo | Tipo | Significado |
|---|---|---|
| `detalles[].entregaEfectiva` | `boolean` | `true` sólo cuando Produbanco reportó `ENTREGADO OK`: **el dinero fue entregado de forma efectiva en la cuenta del beneficiario de ese ítem** |
| `detalles[].estadoItem` | `string` | El estado oficial del banco, tal cual (se puede mostrar; no reemplaza al flag) |
| `totales.entregados` | `number` | Cantidad de ítems con `entregaEfectiva = true` |
| `totales.entregaEfectiva` | `boolean` | `true` sólo si **todos** los ítems del lote fueron entregados (y hay al menos uno) |

El **listado** (sección 5) expone el mismo criterio a nivel de cada `items[]`:
`entregados` y `entregaEfectiva`. Así listado y detalle responden con los
mismos nombres y la misma semántica.

Reglas para el cliente:

- `entregaEfectiva === true` → **confirmado: el dinero llegó a la cuenta**.
- `entregaEfectiva === false` → todavía no hay constancia de entrega: volver a
  consultar; no asumir éxito ni reenviar el pago.
- La comparación es tolerante a mayúsculas, acentos y espacios (`ENTREGADO OK`,
  `entregado ok`, `Entregado`). Cualquier otro valor —incluido
  `NO ENTREGADO`— devuelve `false`.

### Campos internos (sólo admin)

Estos campos **no** se devuelven a la app cliente y sólo aparecen en la
consulta administrativa (sección 9):

| Campo | Significado |
|---|---|
| `idTransaccion` | Identificador interno del lote |
| `operacion` | Servicio interno (`SPR_PRODUBANCO-PAGO`, ...) |
| `status` | Estado interno numérico: `1` PENDIENTE, `2` PROCESADO_BANCO, `3` ERROR, `4` INCIERTO |
| `estadoTransaccion` | Estado verbatim de la cabecera del banco |
| `cargaRespuestaBanco` | XML crudo de la carga al banco (sólo en el detalle) |

Un fallo de consulta **no** rompe la respuesta: se registra en los logs del
microservicio y se devuelve el último estado persistido en BD.

---

## 7. Errores de la carga al banco

El back distingue dos casos:

- **Rechazo definitivo** (`statusServicio = "ERROR"`; internamente `status = 3`):
  Produbanco respondió con error o la
  carga falló antes de enviarse. Se guarda la respuesta cruda del banco y es
  seguro reintentar con otra `Idempotency-Key`:

  ```json
  { "message": "Trama inválida", "respuestaBanco": "<respuesta cruda del SOAP>" }
  ```

- **Resultado incierto** (`statusServicio = "INCIERTO"`; internamente
  `status = 4`): timeout, error de red o respuesta no
  confirmada. La carga **pudo haberse procesado**. Se responde `409` con
  `"La operación quedó en estado INCIERTO..."` y **no** se debe usar una llave
  nueva. El cron reconcilia contra el banco cada 5 minutos.

---

## 8. Idempotencia (importante)

La llave de idempotencia es el header `Idempotency-Key` (UUID por operación),
no el contenido del lote:

- Reintento con la misma llave y mismo contenido:
  - `PROCESADO_BANCO` → devuelve la respuesta original sin reenviar.
  - `PENDIENTE` reciente → `409` "en curso".
  - `INCIERTO` o `PENDIENTE` viejo → consulta al banco; si confirma devuelve
    la respuesta; si no, `409` de estado desconocido **sin** pedir llave nueva.
  - `ERROR` definitivo → `409` habilitando una `Idempotency-Key` nueva.
- Misma llave con **otro contenido** → `422 Unprocessable Entity`.
- Un lote en `ERROR` nunca se recicla ni se reenvía automáticamente.
- Además existe un límite anti-duplicado (mismo monto + misma cuenta
  beneficiario por app en 5 minutos) que también bloquea los `INCIERTO`.

El login fallido y las claves de las apps se manejan en la BD del back; la
documentación Swagger en `/doc` refleja siempre los DTOs vigentes.

---

## 9. Consulta administrativa (solo admin)

Estas rutas ven las transacciones de **todas** las apps y son las únicas que
exponen los campos internos. Requieren que la app tenga el servicio
`ADMIN_PRODUBANCO` **y** el comando correspondiente (`transacciones_admin`,
`estado_transaccion_admin`).

| Método | Ruta | Uso |
|--------|------|-----|
| `GET` | `/admin/produbanco/transacciones` | Listar transacciones de todas las apps (paginado) |
| `GET` | `/admin/produbanco/transacciones/estado/:dato` | Estado en vivo de cualquier app |

- **No** requieren el header `X-Encryption-Key`: el microservicio descifra con
  la `encryptionKey` de la app dueña de cada transacción.
- `:dato` acepta `idTransaccion`, `referenciaLote` en claro o cifrada (esta
  última URL-encoded). El detalle acepta además `?idApp=` para acotar la
  búsqueda.

### Misma respuesta que el cliente + campos internos

La respuesta del admin es **idéntica** a la de la app cliente, más:

| Campo | Dónde | Significado |
|---|---|---|
| `idTransaccion` | listado y detalle | Identificador interno del lote |
| `operacion` | listado y detalle | Servicio interno (`SPR_PRODUBANCO-PAGO`, ...) |
| `status` | listado y detalle | Estado interno numérico (`1` PENDIENTE, `2` PROCESADO_BANCO, `3` ERROR, `4` INCIERTO) |
| `estadoTransaccion` | listado y detalle | Estado verbatim de la cabecera del banco |
| `cargaRespuestaBanco` | sólo detalle | XML crudo de la carga al banco (diagnóstico) |
| `appId` | listado y detalle | `id_app` dueña de la transacción |
| `appIdentificador` | listado y detalle | Identificador de esa app |
| `appNombre` | listado y detalle | Nombre de esa app |
| `banco` | sólo detalle | Respuesta en vivo de Produbanco (`orden` / `movimientos` SOAP) |

Todo lo demás —`referenciaLote`, `statusServicio`, `codigoBanco`,
`mensajeBanco`, `fechaConsultaBanco`, `envioId`, `errorMessage`,
`fechaCreacion`, beneficiario, `registros`, `montoTotal`, `entregados`,
`entregaEfectiva`, `estadosDetalle`, `detalles[]` con `entregaEfectiva` por
ítem— es exactamente igual que en la respuesta del cliente, así que un mismo
consumidor puede reutilizar el parseo entre ambos endpoints.

> `banco` sólo se devuelve en el detalle administrativo; el listado y los
> endpoints de cliente nunca incluyen el SOAP crudo.
