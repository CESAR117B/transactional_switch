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

{ "user_app": "tu_user_app", "app_key": "tu_app_key" }
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

- Tu app recibe tres credenciales: `user_app` (identificación),
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
| `GET` | `/tramas-produbanco/transacciones/estado/:dato` | Estado en vivo por `referencia_lote` (cifrada o en claro) |

> **Lo que NO se envía** (lo inyecta el back): `cuentaEmpresa`,
> `tipo_cuenta_empresa`, `empresa`, `id_empresa` y `referencia_lote`.
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
  "id_servicio": "75",
  "detalles": [
    {
      "tipoId": "C",
      "identificacion": "1723456789",
      "nombre": "Juan Pérez",
      "forma_pago": "SPI",
      "tipo_cuenta": "CTE",
      "cuenta": "0036001234567890",
      "banco_codigo": "0036",
      "monto": 150.75,
      "referencia": "FAC-00123",
      "email": "jperez@email.com"
    }
  ]
}
```

| Campo | Notas |
|-------|-------|
| `servicio` / `id_servicio` | Obligatorios; los asigna Produbanco por operación (PV/75 = pago interbancario) |
| `forma_pago` | `CTA` cuenta Produbanco · `SPI` otro banco · `CHQ` cheque · `EFE` ventanilla |
| `tipo_cuenta` / `cuenta` / `banco_codigo` | Obligatorios si `forma_pago` es `CTA` o `SPI` |
| `referencia` | **Obligatoria**: número de factura que tu sistema genera (va al banco como referencia del pago) |
| `fechaInicio` / `fechaVencimiento` | **No se envían**: el microservicio genera la vigencia del sobre automáticamente (hoy → hoy + 1) y la incluye en la trama al banco |

> Los valores válidos de `tipo_id`, `forma_pago`, `tipo_cuenta`, `moneda` y los
> códigos de banco para `bancoCodigo` están en la **sección 10** (Catálogos de
> códigos).

**Respuesta** (`201`):

```json
{
  "referencia_lote": "OWFiYzoxYWJjZGVm[…]",
  "monto_total": 150.75
}
```

> **`referencia_lote` viene ENRIPTADA** con la `encryption_key` de tu app (no la
> desencripta el back al responder): guárdala tal cual en tu base de datos y
> desencripta tú localmente cuando la necesites en claro. Su formato en claro
> es `NOMBREAPP-{secuencia}-{yyyyMMddHHmmss}-{4 hex}` (ej:
> `TIENDA-00001-20261016143052-a3f9`) y su valor cifrado es
> `IV:AuthTag:Texto` (base64 separado por `:`).

> **Ya NO se devuelven** `exito`, `id_transaccion`, `envio_id` ni
> `total_registros`: la respuesta se limita a `referencia_lote` y
> `monto_total`. Para obtener `envio_id` consulta el listado (sección 5) o el
> estado (sección 6) — esos sí lo incluyen.
>
> **`id_transaccion` no se expone a la app cliente**: es un identificador
> interno que sólo ve la consulta administrativa (sección 9). Guarda la
> `referencia_lote` y úsala como identificador de la operación y como `:dato`
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
  "id_servicio": "80",
  "detalles": [
    {
      "tipo_id": "P",
      "identificacion": "AB123456",
      "tipo_cuenta": "CTE",
      "beneficiario_nombre": "John Smith",
      "beneficiario_direccion": "123 Main St, New York, USA",
      "beneficiario_cuenta": "DE89370400440532013000",
      "banco_destino_nombre": "Citibank N.A.",
      "banco_destino_direccion": "111 Wall Street, New York, USA",
      "codigo_swift_aba": "CITIUS33",
      "monto": 1500.50,
      "motivo_transferencia": "106,0",
      "moneda": "USD",
      "tipo_comision": "SHA",
      "referencia": "FAC-00456"
    }
  ]
}
```

| Campo | Notas |
|-------|-------|
| `fechaInicio` / `fechaVencimiento` | **No se envían**: el microservicio genera la vigencia del sobre automáticamente (hoy → hoy + 1) y la incluye en la trama al banco |
| `motivo_transferencia` | **Obligatoria**: `codigo,ejención` según catalogo SIB (ej: `106,0` = sin exención) |
| `codigo_swift_aba` | SWIFT/BIC o ABA del banco destino, 8–11 mayusculas |
| `moneda` | ISO-3, default `USD` |
| `tipo_comision` | `OUR` ordenante · `BEN` beneficiario · `SHA` compartida |
| `referencia` | Opcional (máx. 50); si falta, el back usa la `referencia_lote` generada |

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
| `fecha_desde` / `fecha_hasta` | `?fecha_desde=01/10/2026&fecha_hasta=19/10/2026` | Formato `DD/MM/YYYY`, rango **inclusivo** de día completo en **horario Ecuador** (UTC-5). `400` si el formato es inválido, la fecha no existe (ej: `31/02`) o `fecha_desde > fecha_hasta` |
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
      "referencia_lote": "TIENDA-00001-20261016143052-a3f9",
      "status_servicio": "PROCESADO_BANCO",
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
      "entrega_efectiva": false,
      "estados_detalle": { "Pendiente de envio por el banco": 1 }
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
  "codigo_banco": "0000",
  "mensaje_banco": "CONSULTA EXITOSA",
  "fecha_consulta_banco": "16/10/2026 09:15:00",
  "envioId": "12345678",
  "error_message": null,
  "fecha_creacion": "2026-10-15T10:00:00.000Z",
  "totales": {
    "registros": 1,
    "montoTotal": 150.75,
    "entregados": 1,
    "entrega_efectiva": true
  },
  "detalles": [
    {
      "secuencia": 1,
      "tipoId": "C",
      "identificacion": "1723456789",
      "nombre": "Juan Pérez",
      "cuenta": "0036001234567890",
      "banco_codigo": "0036",
      "forma_pago": "SPI",
      "monto": 150.75,
      "moneda": "USD",
      "referenciaDocumento": "FAC-00123",
      "estadoItem": "ENTREGADO OK",
      "entregaEfectiva": true,
      "codigo_respuesta": "0000",
      "mensaje_banco": "PAGO PROCESADO"
    }
  ]
}
```

> **Campos que NO se devuelven a la app cliente:** `id_transaccion`,
> `operacion`, `status`, `estado_transaccion` y `cargaRespuestaBanco`. Son
> internos y sólo aparecen en la consulta administrativa (sección 9). El
> mismo criterio aplica al listado (sección 5).

### Cómo leer los estados

Para la app cliente, el **único** indicador de estado de la cabecera es
`statusServicio`:

| `status_servicio` | Significado | Qué hacer |
|---|---|---|
| `PENDIENTE` | Enviada, aún sin respuesta definitiva del banco | Consultar más tarde; **no** reenviar |
| `PROCESADO_BANCO` | **La operación fue procesada por el banco** | Éxito del lote: revisar `detalles[]` |
| `INCIERTO` | No se pudo confirmar (timeout, corte, respuesta incompleta) | Volver a consultar; **no** reenviar con llave nueva |
| `ERROR` | El banco o la validación rechazaron la operación | Revisar `errorMessage`, `codigoBanco` / `mensajeBanco` |
| `DESCONOCIDO` | Estado no mapeado (dato legado) | Tratar como `INCIERTO` y consultar |

```text
status_servicio === "PROCESADO_BANCO"                       → operación exitosa
status_servicio === "PENDIENTE" | "INCIERTO" | "DESCONOCIDO" → volver a consultar
status_servicio === "ERROR"                                 → falló; no reintentar sin corregir
```

> `PROCESADO_BANCO` indica que el **lote** fue procesado. El resultado de cada
> pago está en `detalles[].estadoItem` y `detalles[].entregaEfectiva`, porque
> un lote puede procesarse con ítems entregados y otros rechazados.

Otros campos públicos:

| Campo | Significado |
|-------|-------------|
| `estadoItem` (detalle) | Estado **verbatim de Produbanco** por pago dentro del lote (`Pendiente de envio por el banco`, `Aplica al banco`, `PROCESO OK`, `ENTREGADO OK`, `PROCESADAS ERROR`, ...). Se devuelve sin interpretar. |
| `codigo_banco` / `mensaje_banco` | Último código/mensaje de la consulta al banco (`0005` = aún sin datos) |
| `envio_id` | Identificador del sobre en Produbanco, para trazabilidad |

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
| `appUserApp` | listado y detalle | Identificador de esa app |
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

---

## 10. Catálogos de códigos

Valores tomados del anexo de
`produbanco/Formato ENTRADA PAGOS_FULL(E).md` y de los DTOs vigentes del API.
Son **sensibles a mayúsculas**: envíalos exactamente como se muestran.

### 10.1 Tipo de identificación (`tipoId`)

| Código | Significado | Longitud |
|---|---|---|
| `C` | Cédula | 10 dígitos |
| `R` | RUC | 13 dígitos |
| `P` | Pasaporte | hasta 13 caracteres |

### 10.2 Forma de pago (`formaPago`)

| Código | Significado | Cuándo usarlo | Campos obligatorios |
|---|---|---|---|
| `CTA` | Crédito a cuenta | Pago a una cuenta de Produbanco | `tipoCuenta`, `cuenta`, `bancoCodigo` = `0036` |
| `SPI` | Transferencia interbancaria | Pago a una cuenta de **otro** banco local | `tipoCuenta`, `cuenta`, `bancoCodigo` del banco destino |
| `CHQ` | Cheque | Emisión de cheque para cobro en ventanilla | `bancoCodigo` = `0036` |
| `EFE` | Efectivo | Pago en ventanilla | `bancoCodigo` = `0036` |

> El archivo plano PAGOS_FULL de Produbanco distingue sólo `CTA`, `CHQ` y
> `EFE`; la API usa `SPI` para dejar explícito que el destino es otro banco.
> Para pagos por SPL vía BCE el documento del banco indica el código `0001`
> (Banco Central del Ecuador).

### 10.3 Tipo de cuenta (`tipoCuenta`)

| Código | Significado |
|---|---|
| `CTE` | Cuenta corriente |
| `AHO` | Cuenta de ahorros |
| `TAR` | Tarjeta de crédito (otros bancos; `bancoCodigo` debe ser el emisor) |

Sólo aplica cuando `formaPago` es `CTA` o `SPI`; para `CHQ` o `EFE` se omite.

### 10.4 Moneda (`moneda`)

| Código | Significado |
|---|---|
| `USD` | Dólar estadounidense (único valor soportado hoy) |

### 10.5 Formato del número de cuenta (`cuenta`)

| Banco destino | Formato |
|---|---|
| Produbanco (`0036`) | 11 dígitos, rellenar con ceros a la izquierda (`1234567` → `00001234567`) |
| Otro banco local | Tal cual lo entrega el banco, **sin** relleno de ceros |
| Tarjeta (`TAR`) | Número de tarjeta; `bancoCodigo` debe ser el banco emisor |

### 10.6 Códigos de instituciones financieras (`bancoCodigo`)

Catálogo del anexo de Produbanco. El banco advierte que **puede cambiar**
cuando se habilitan o eliminan instituciones: si un código no aparece o el
pago es rechazado, solicita el listado actualizado a tu ejecutivo de Cash
Management.

> Para bancos y cooperativas locales el código es de **4 dígitos**. El campo
> admite hasta 10 caracteres por si Produbanco habilita códigos extendidos.

| Código | Institución |
|---|---|
| `0036` | PRODUBANCO |
| `0001` | BANCO CENTRAL |
| `0010` | PICHINCHA |
| `0017` | GUAYAQUIL |
| `0024` | CITIBANK |
| `0025` | MACHALA |
| `0027` | DELBANK |
| `0029` | LOJA |
| `0030` | PACIFICO |
| `0032` | INTERNACIONAL |
| `0034` | AMAZONAS |
| `0035` | AUSTRO |
| `0037` | BOLIVARIANO |
| `0039` | COMERCIAL DE MANABI |
| `0042` | RUMINAHUI |
| `0043` | DEL LITORAL |
| `0059` | SOLIDARIO |
| `0060` | BANCO PROCREDIT |
| `0061` | BANCO CAPITAL |
| `0062` | BANCO PARA LA ASISTENCIA COMUNITARIA FINCA S.A. |
| `0064` | BANCO COOPNACIONAL SA |
| `0065` | BANCO DESARROLLO DE LOS PUEBLOS S.A. |
| `0066` | BANECUADOR B.P. |
| `0085` | MUTUALISTA IMBABURA |
| `0086` | MUTUALISTA PICHINCHA |
| `0087` | MUTUALISTA AMBATO |
| `0088` | MUTUALISTA AZUAY |
| `0100` | COOP. AHORRO Y CREDITO 15 DE ABRIL LTDA |
| `0102` | COOP. AHORRO Y CREDITO CARIAMANGA LTDA. |
| `0103` | COOP. AHORRO Y CREDITO PUELLARO LTDA |
| `0105` | COOP. DE A. Y C. 16 DE JUNIO |
| `0107` | COOP. DE A. Y C. 23 DE MAYO LTDA. |
| `0108` | COOP. DE A. Y C. MAQUITA CUSHUNCHIC LTDA. |
| `0109` | COOP. DE AHORRO Y CREDITO SAN FRANCISCO DE ASIS LT |
| `0124` | COOP. AHORRO Y CREDITO MANANTIAL DE ORO LTDA. |
| `0125` | COOP. AHORRO Y CREDITO JUAN DE SALINAS LTDA. |
| `0126` | COOP. AHORRO Y CREDITO NUEVA JERUSALEN |
| `0129` | COOP. AHORRO Y CREDITO AGRARIA MUSHUK KAWSAY LTDA. |
| `0130` | COOP. AHORRO Y CREDITO TENA LTDA. |
| `0131` | COOP. AHORRO Y CREDITO DE LA PEQUENA EMPRESA GUALA |
| `0132` | COOP. AHORRO Y CREDITO MI TIERRA |
| `0133` | COOP. DE AHORRO Y CREDITO DE LA PEQ. EMP. CACPE YA |
| `0134` | COOP. AHORRO Y CREDITO FUNDESARROLLO |
| `0135` | COOP. A Y C DE LA PEQ. EMP. CACPE ZAMORA LTDA. |
| `0139` | COOP. AHO Y CRED ALIANZA MINAS LTDA. |
| `0140` | ECUATORIANO DE LA VIVIENDA |
| `0143` | COOPERATIVA 9 DE OCTUBRE LTDA |
| `0144` | COOPERATIVA CACPE BIBLIAN LTDA |
| `0155` | COOP. DE AH Y CR ONCE DE JUNIO |
| `0161` | COOP DE AH Y CR DE SERV PUBLIC MINISTERIO EDUC Y C |
| `0168` | COOP AH Y CR POLICIA NACIONAL |
| `0183` | BANCO D MIRO SA |
| `0185` | CoopAhyCr de la Pequena Empresa de Loja CACPE L |
| `0187` | COOP. DE AHORRO Y CREDITO SR. DE GIRON |
| `0204` | CoopAhyCredito Ambato Ltda |
| `0205` | COOPE AHO Y CRED PADRE JULIAN LORENTE LTDA |
| `0214` | COOP AHO Y CRED EDUCADORES DE CHIMBORAZO |
| `0221` | COOP DE AHO Y CRED SAN MIGUEL DE LOS BANCOS |
| `0222` | COOP AH Y CR SAN ANTONIO LTDA. |
| `0229` | COOP AH Y CRJUAN PIO MORA LTDA |
| `0230` | COOP AH Y CR EDUCADORES DE PASTAZA LTDA |
| `0233` | COOPE.CAMARA DE COMERCIO DE AMBATO |
| `0257` | COOP AH Y CR COCA LTDA |
| `0263` | COOP. DE AHORRO Y CREDITO MUSHUC RUNA LTDA. |
| `0270` | COOP AH Y CR CREDIAMIGO |
| `0275` | COOP. DE AHORRO Y CREDITO NUEVA HUANCAVILCA LTDA. |
| `0291` | COOP. DE AH Y CR LA INMACULADA DE SAN PLACIDO LTDA |
| `0293` | COOP. DE A Y C. LUZ DEL VALLE |
| `0295` | COOPERATIVA DE AHORRO Y CREDITO LA BENEFICA LTDA |
| `0296` | COOPERATIVA DE AHORRO Y CREDITO FERNANDO DAQUILEMA |
| `0299` | COOP DE AHORRO Y CREDITO LA MERCED LTDA |
| `0300` | COOP. DE AHORRO Y CREDITO PEDRO MONCAYO LTDA. |
| `0301` | COOP. DE AHORRO Y CREDITO LOS ANDES LATINOS LTDA. |
| `0302` | COOP. DE A Y C GUAMOTE LTDA |
| `0303` | COOP. DE A. Y C. CREDISOCIO |
| `0306` | COOP. DE A. Y C. CAMARA DE COMERCIO SANTO DOMINGO |
| `0308` | COOP DE A Y CR CORPORACION CENTRO LTDA |
| `0311` | COOP AHORRO Y CREDITO SAN GABRIEL LTDA |
| `0312` | COOP AHORRO Y CREDI MUJERES UNIDAS TANTANAKUSHKA W |
| `0313` | COOPERATIVA DE AHORRO Y CREDITO ARTESANOS LTDA |
| `0314` | COOPERATIVA DE AHORRO Y CREDITO SANTA ANITA LTDA |
| `0315` | COOP. DE A. Y C. 13 DE ABRIL LTDA |
| `0316` | COOP. DE AHORRO Y CREDITO PILAHUIN TIO LTDA. |
| `0318` | COOP. DE A. Y C. COOPAC AUSTRO LTDA -MIESS |
| `0319` | COOPERATIVA DE AHORRO Y CREDITO CREA LTDA -MIES |
| `0320` | COOP. DE A. Y C. CHIBULEO LTDA. |
| `0323` | COOP. DE AHORRO Y CREDITO 4 DE OCTUBRE LTDA. |
| `0324` | COOP AHORRO Y CREDITO SAN ISIDRO LTDA |
| `0327` | COOP. AHORRO Y CREDITO SEMILLA DEL PROGRESO LTDA. |
| `0328` | COOP. DE AHORRO Y CREDITO HUAICANA LTDA |
| `0331` | COOP. DE A. Y C. ABDON CALDERON LTDA. |
| `0338` | COOPERATIVA DE AHORRO Y CREDITO PUCARA LTDA |
| `0341` | COOPERATIVA DE AHORRO Y CREDITO MULTIEMPRESARIAL L |
| `0342` | COOP DE A Y C SAN JUAN DE COTOGCHOA |
| `0353` | COOPERATIVA DE AHORRO Y CREDITO MINGA LTDA |
| `0354` | COOP DE AH Y CR ERCO LTDA. |
| `0355` | COOP DE AHORRO Y CREDITO SANTA ISABEL LTDA |
| `0359` | COOP. DE A. Y C. LUCHA CAMPESINA LTDA. |
| `0368` | COOP AH Y CR ANDINA LTDA |
| `0372` | COOP DE AH Y CR NUEVA ESPERANZA |
| `0373` | COOP. DE AH Y CR FORTUNA - MIES |
| `0395` | COOP DE AHORRO Y CREDITO PROVIDA |
| `0397` | COOPERATIVA DE AHORRO Y CREDITO LAS LAGUNAS-MIESS |
| `0404` | COOP DE A Y C FUTURO LAMANENSE |
| `0405` | COOPERATIVA DE AHORO Y CREDITO VISION DE LOS ANDES |
| `0406` | COOP A Y C UNION EL EJIDO |
| `0407` | COOP A Y C VILCABAMBA CACVIL |
| `0408` | COOP A Y C CADECOG GONZANAMA |
| `0426` | COOP. DE AHORRO Y CREDITO SAN MIGUEL DE PALLATANGA |
| `0431` | COOP DE A Y C SANTA ANA DE NAYON |
| `0432` | COOP A Y C ESPERANZA Y PROGRESO DEL VALLE |
| `0440` | COOP. DE AH Y CR 1 DE JULIO |
| `0446` | COOP.DE AHORRO Y CREDITO MICROEMPRESARIAL SUCRE |
| `0457` | COOP. DE AH Y CR TEXTIL 14 DE MARZO |
| `0467` | COOP. DE AH Y CR INDIGENA SAC LTDA |
| `0470` | COOP. DE AH Y CR FOCLA |
| `0479` | COOP. DE AH Y CR SANTA LUCIA LTDA |
| `0486` | COOP. DE AH Y CR CACPE CELICA |
| `0487` | COOP. DE AH Y CR CACEC LTDA. COTOPAXI |
| `0488` | COOP. DE AH Y CR MAGISTERIO MANABITA LIMITADA |
| `0489` | COOP. DE AH Y CR ALFONSO JARAMILLO C.C.C. |
| `0498` | COOP. DE AH Y CR PARA LA VIVIENDA ORDEN Y SEGURIDA |
| `0506` | COOP. DE AH Y CR VIRGEN DEL CISNE |
| `0508` | COOP. DE AH Y CR SANTA MARIA DE LA MANGA DEL CURA |
| `0509` | COOP. DE AH Y CR 16 DE JULIO LTDA |
| `0510` | COOP. DE AH Y CR METROPOLIS LTDA. |
| `0511` | COOP. DE AH. Y CR. SAN MARTIN DE TISALEO LTDA. |
| `0512` | COOP. DE AH Y CR EDUCADORES TULCAN LTDA |
| `0513` | COOP. DE AH Y CR EDUCADORES DE ZAMORA CHINCHIPE |
| `0517` | COOP. DE AH Y CR LIMITADA MIFEX |
| `0520` | COOP. DE AH Y CR SERVIDORES MUNICIPALES DE CUENCA |
| `0522` | COOP. DE AH Y CR EDUCADORES DE LOJA |
| `0524` | COOP. DE AH Y CR GRAMEEN AMAZONAS |
| `0525` | COOP DE AH Y CR PUERTO FRANCISCO DE ORELLANA |
| `0526` | COOP. DE AH Y CR CAMARA DE COMERCIO JOYA DE LOS SA |
| `0529` | COOP. DE AH Y CR PADRE VICENTE PONCE RUBIO |
| `0533` | COOP. DE AH Y CR ESPERANZA DEL FUTURO LTDA |
| `0534` | COOP. AH Y CR SUMAK KAWSAY |
| `0535` | COOP. AH Y CR VISIONFUND ECUADOR S. A. |
| `0537` | COOP. AH Y CR SAN ANTONIO LTDA. - IMBABURA(MIES) |
| `0538` | COOP DE AH Y CR ECUACREDITOS LTDA |
| `0539` | BANCO DEL INSTITUTO ECUATORIANO DE SEGURIDAD SOCIA |
| `0550` | COOP. DE AH Y CR SAN JOSE S.J. |
| `0552` | COOP. DE AH Y CR LA FLORESTA LTDA. |
| `0554` | COOP. DE AH Y CR SOL DE LOS ANDES LTDA. |
| `0555` | COOP. DE AH Y CR SIERRA CENTRO |
| `0564` | COOP. DE AH Y CR ACCION IMBABURAPAK LTDA. |
| `0567` | COOP. DE AH Y CR KULLKI WASI LTDA. |
| `0568` | COOP. DE AH Y CR ACCION TUNGURAHUA LTDA |
| `0572` | COOP. DE AH Y CR DON BOSCO |
| `0573` | COOP. DE AH Y CR VENCEDORES DE TUNGURAHUA |
| `0575` | COOP. DE AH Y CR FONDO PARA EL DESARROLLO Y LA VID |
| `0576` | COOP. DE AH Y CR 17 DE MARZO LTDA |
| `0577` | COOP. DE AH Y CR BASE DE TAURA |
| `0578` | COOP DE AH Y CR HERMES GAIBOR VERDESOTO |
| `0579` | COOPERATIVA DE AH Y CR CANAR LTDA. |
| `0581` | COOP. DE AH Y CR MUSHUK - YUYAY(CANAR) |
| `0582` | COOP. DE AH Y CR EL MOLINO LTDA. |
| `0583` | COOP. DE AH Y CR PUSHAK RUNA HOMBRE LIDER |
| `0585` | COOP. DE AH Y CR OCCIDENTAL |
| `0586` | COOP. DE AH Y CR. SIMON BOLIVAR |
| `0587` | COOP. DE AH Y CR UNIBLOCK Y SERVICIOS LTDA. |
| `0589` | CASA DE VALORES SMARTCAPITAL S. A. MV |
| `0590` | COOP AH Y CR DE INDIGENAS CHUCHUQUI LTDA |
| `0591` | COOP DE AH Y CR GANANSOL LTDA |
| `0592` | COOP AH Y CR CHUNCHI LTDA |
| `0593` | COOP DE AH Y CR NACIONAL LLANO GRANDE LTDA. |
| `0594` | COOP DE AH Y CR OBRAS PUBLICAS FISCALES DE LOJA Y |
| `0595` | COOP. DE AH Y CR FUTURO Y PROGRESO DE GALAPAGOS LT |
| `0596` | COOP. DE AH Y CR EDUC. DEL TUNGURAHUA LTDA. |
| `0597` | COOP DE AH Y CR SAN MIGUEL LTDA. |
| `0598` | COOP DE AH Y CR CREDI YA LTDA. |
| `0602` | COOP. DE AH Y CR CAMARA DE COMERCIO DEL CANTON BOL |
| `0603` | COOP. DE AH Y CR CASAG LTDA |
| `0604` | COOP. DE AH Y CR SANTA ROSA DE PATUTAN LTDA. |
| `0605` | COOP. DE AH Y CR LOS RIOS |
| `0606` | COOP. DE AH Y CR CREDISUR LTDA. |
| `0610` | COOP. DE AH Y CR FASAYNAN LTDA |
| `0611` | COOP. DE AH Y CR SAN JOSE EL AIRO |
| `0613` | COOP. DE AH Y CR SALINERITA |
| `0615` | COOP. DE AH Y CR DEL SINDICATO DE CHOFERES PROFESI |
| `0616` | COOP. DE AH Y CR UNIDAD Y PROGRESO |
| `0617` | COOP. DE AH Y CR RURAL SIERRA NORTE COOPRUSIENOR |
| `0618` | COOP. DE AH Y CR EL CALVARIO LTDA |
| `1015` | DINERS/VISA INTERDIN/DISCOVER - Transferencias EnL |
| `9963` | CORPORACION FINANCIERA |
| `9964` | FINANCIERA FINANCOOP |
| `9965` | COOP AHORRO Y CREDITO COOPROGRESO |
| `9967` | DINERS CLUB |
| `9969` | COOP. TULCAN |
| `9970` | COOP. PABLO MUNOZ VEGA |
| `9971` | COOP. CALCETA LTDA. |
| `9972` | COOP DE AH Y CR CONSTRUCCION COMERCIO Y PRODUCCION |
| `9974` | COOP. JUVENTUD ECUATORIANA PROGRESISTA LTDA. |
| `9975` | COOP. AHO Y CREDITO 23 DE JULIO |
| `9976` | COOP. AHO Y CREDITO SANTA ANA |
| `9977` | COOP. ALIANZA DEL VALLE LTDA. |
| `9979` | COOP. RIOBAMBA |
| `9980` | COOP. COMERCIO LTDA PORTOVIEJO |
| `9981` | COOP. CHONE LTDA. |
| `9982` | COOP. CACPECO |
| `9983` | COOP. ATUNTAQUI |
| `9984` | COOP. GUARANDA |
| `9985` | COOP AHO Y CREDITO SANTA ROSA |
| `9986` | COOP. AHO Y CREDITO EL SAGRARIO |
| `9987` | COOP. OSCUS |
| `9988` | COOP. LA DOLOROSA |
| `9989` | COOP AHO Y CREDITO MANUEL GODOY |
| `9991` | COOP AHO Y CREDITO SAN JOSE |
| `9992` | COOP. AHO Y CREDITO SAN FRANCISCO |
| `9993` | COOP. AHO Y CREDITO JARDIN AZUAYO |
| `9994` | COOP. COTOCOLLAO |
| `9995` | COOP. 29 DE OCTUBRE |
| `9997` | COOP. PEQ. EMPRESA DE PASTAZA |
| `9998` | COOP. ANDALUCIA |
| `9999` | COOP. PREVISION AHORRO Y DESARROLLO |

> `1015` agrupa transferencias a tarjetas Diners/Visa Interdin/Discover y
> `9967` corresponde a Diners Club. Las entradas con nombres abreviados o
> cortados se transcriben tal cual figuran en el anexo del banco.
