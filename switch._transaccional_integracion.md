## Como integrarse con el microservicio

Esta sección explica cómo una aplicación externa (una app ajena al proyecto
actual) debe conectarse al **switch transaccional** y utilizar las funciones
que el microservicio expone, incluidas las funcionalidades implementadas por
otras apps del ecosistema.

### 1. Arquitectura de la integración

La app externa **nunca** se conecta directamente al microservicio por TCP ni
accede a su base de datos. El único punto de entrada es la **app cliente
(gateway HTTP)**, que autentica, autoriza y reenvía la operación al
microservicio por el canal interno.

```text
App externa / terceros
        │  HTTPS + JWT
        ▼
client-app (gateway HTTP, puerto 3000)
        │  TCP interno (puerto 3001)
        ▼
microservicio (switch transaccional)
        │
        ├── PostgreSQL
        └── Integraciones externas (bancos, tokenización, etc.)
```

Componentes:

| Componente | Función | Puerto por defecto |
|---|---|---|
| App cliente / gateway | API HTTP pública, login, JWT, permisos, rate limit. | `3000` |
| Microservicio | Lógica transaccional, persistencia e integraciones. | `3001` (interno) |

- La app externa consume **sólo HTTP** contra el gateway.
- El microservicio no debe exponerse a Internet.
- El gateway revalida en cada petición la app, sus servicios y sus permisos
  contra la base de datos.

### 2. Requisitos previos

Antes de operar, la app externa necesita:

1. **URL base** del gateway, por ejemplo:
   `https://<host-del-switch>:3000`.
2. **Credenciales propias** entregadas por la app administradora:
   - `app_id` (el `identificador_app`).
   - `app_key` (la `key`).
   - `encryptionKey` (necesaria para operaciones cifradas).
3. **Servicios asignados** según las funciones que vaya a utilizar.
4. **Comandos/permisos** habilitados para esos servicios.
5. Conectividad de red y, en producción, HTTPS.

> La app externa **no se autorregistra**. El alta la realiza la app
> administradora (`admin_app`) mediante `POST /admin/registrar_app`. Por eso
> el primer paso es solicitar la integración al equipo que administra el
> switch y acordar qué servicios necesita la app.

### 3. Proceso de alta de la app externa

El flujo completo es:

```text
1. La app externa solicita integración al administrador.
2. El administrador registra la app (registrar_app).
3. El administrador asigna los servicios (asignar-servicios-app).
4. El administrador entrega app_id, app_key y encryptionKey.
5. La app externa hace login en /auth/login y obtiene el JWT.
6. La app externa consulta /servicios/mis-servicios.
7. La app externa consume los endpoints de los servicios asignados.
```

#### Paso 1: alta de la app (la ejecuta el administrador)

```http
POST /admin/registrar_app
Authorization: Bearer <token-de-admin_app>
Content-Type: application/json
```

```json
{
  "identificador_app": "app-externa",
  "nombre": "App Externa S.A.",
  "desarrollador": "Tercero",
  "ruc": "1790012345001",
  "email": "desarrollador@ejemplo.com"
}
```

La respuesta devuelve **una sola vez**:

```json
{
  "id_app": 25,
  "identificador_app": "app-externa",
  "key": "<app_key>",
  "encryptionKey": "<encryptionKey>",
  "servicios": []
}
```

La app externa debe guardar esos valores en un gestor de secretos. La `key`
no se puede recuperar después.

#### Paso 2: asignación de servicios (la ejecuta el administrador)

El administrador consulta el catálogo y asigna los códigos que correspondan a
las funciones que la app externa va a usar:

```http
GET /admin/listar-servicios
Authorization: Bearer <token-de-admin_app>
```

```http
POST /admin/asignar-servicios-app
Authorization: Bearer <token-de-admin_app>
Content-Type: application/json
```

```json
{
  "idApp": 25,
  "codigos": ["<CODIGO_SERVICIO_1>", "<CODIGO_SERVICIO_2>"]
}
```

> `asignar-servicios-app` reemplaza **todas** las asignaciones previas de la
> app. Si la app ya tenía servicios, hay que enviar el conjunto completo que
> debe conservar.

#### Paso 3: entrega de credenciales

El administrador entrega a la app externa:

| Dato | Uso |
|---|---|
| `app_id` (`identificador_app`) | Campo `app_id` del login. |
| `app_key` (`key`) | Campo `app_key` del login. |
| `encryptionKey` | Header `X-Encryption-Key` en consultas que lo requieran. |
| Lista de servicios asignados | Define qué endpoints puede usar. |

### 4. Autenticación desde la app externa

#### 4.1 Login

```http
POST /auth/login
Content-Type: application/json
```

```json
{
  "app_id": "app-externa",
  "app_key": "<app_key>"
}
```

Respuesta:

```json
{
  "access_token": "<JWT>",
  "expires_in": 3600
}
```

- El token se envía en cada petición:

```http
Authorization: Bearer <access_token>
```

- Dura **1 hora**. Ante `401` hay que volver a autenticarse.
- Si la app fue bloqueada, no tiene el servicio asignado o se le quitó un
  comando, el gateway rechaza la petición aunque el token todavía no haya
  expirado.

#### 4.2 Descubrir los servicios asignados

```http
GET /servicios/mis-servicios
Authorization: Bearer <access_token>
```

Devuelve los servicios vigentes de la app (activos globalmente y activos para
esa app):

```json
[
  {
    "nombre": "Produbanco",
    "codigo": "SPR_PRODUBANCO",
    "descripcion": "Pagos y transferencias Produbanco",
    "activo": true
  }
]
```

También se puede verificar la identidad y el estado de la sesión con:

```http
GET /app
Authorization: Bearer <access_token>
```

#### 4.3 Verificar disponibilidad del servicio

```http
GET /health
```

Es público (sin JWT). Devuelve `200` si hay conexión con el microservicio o
`503` con el código `MICROSERVICIO_NO_DISPONIBLE`.

### 5. Servicios disponibles y prueba

La app externa sólo puede usar los endpoints de los servicios que el
administrador le haya asignado. Para consultar qué tiene habilitado:

```http
GET /servicios/mis-servicios
Authorization: Bearer <access_token>
```

El catálogo completo de servicios lo consulta el administrador con:

```http
GET /admin/listar-servicios
Authorization: Bearer <token-de-admin_app>
```

Los nombres y códigos reales de los servicios se obtienen con
`GET /admin/listar-servicios`. Cada integración tiene su propia guía de
payload y operación en un documento aparte.

> Esta guía sólo cubre la conexión al gateway, el alta de la app y la
> asignación de servicios.

### 6. Cómo se habilitan funciones de otras apps

Una funcionalidad de otra app se consume a través de un **servicio publicado**
en el catálogo del switch. La app externa no llama directamente a la otra app,
no comparte su base de datos y no reutiliza sus credenciales.

El contrato de integración es:

```text
Código de servicio  →  controladores/endpoints habilitados
       +                        +
  app asignada           JWT de la app externa
       =                acceso permitido
```

Para habilitar una función de otra app:

1. La funcionalidad debe estar publicada como un **servicio** con su
   **código** y sus **controladores/comandos** registrados en la base de datos.
2. El administrador asigna ese código de servicio a la app externa con
   `POST /admin/asignar-servicios-app`.
3. La app externa inicia sesión con **sus propias credenciales**.
4. La app externa llama al endpoint HTTP del gateway asociado a ese servicio.
5. El gateway valida el servicio y el comando vigentes y recién entonces
   ejecuta la función en el microservicio.

Reglas importantes:

- **No hay llamadas app-a-app directas.** Todo pasa por el gateway y por el
  microservicio.
- **Cada app usa sus propias credenciales.** No se comparten `app_key` ni
  `encryptionKey` entre apps.
- **Aislamiento de datos:** salvo los servicios administrativos, una app sólo
  accede a la información asociada a su `id_app`.
- **Si el servicio no está en el catálogo, la función no está disponible**
  para integración. Hay que solicitar que se publique y asigne.
- **El administrador controla el acceso:** puede asignar, desasignar o
  desactivar el servicio sin tocar el código de la app externa.

### 7. Ejemplo rápido para probar

```bash
BASE_URL="https://switch.ejemplo.com"

# 1. Login de la app administradora
ADMIN_TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"app_id":"admin_app","app_key":"admin_app_1234"}' \
  | jq -r '.access_token')

# 2. Registrar la app de prueba
curl -s -X POST "$BASE_URL/admin/registrar_app" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"identificador_app":"app-prueba","nombre":"App de prueba"}'

# 3. Asignar los servicios que se quieren probar
#    (reemplazar los códigos por los que devuelve GET /admin/listar-servicios)
curl -s -X POST "$BASE_URL/admin/asignar-servicios-app" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"idApp":<id_app_devuelto>,"codigos":["<CODIGO_SERVICIO>"]}'

# 4. Login de la app de prueba con las credenciales devueltas en el paso 2
APP_TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"app_id":"app-prueba","app_key":"<app_key>"}' \
  | jq -r '.access_token')

# 5. Verificar los servicios habilitados
curl -s "$BASE_URL/servicios/mis-servicios" \
  -H "Authorization: Bearer $APP_TOKEN"
```

### 8. Errores, límites y reintentos

| Código | Significado | Acción sugerida |
|---|---|---|
| `400` | Datos inválidos o header requerido faltante. | Corregir el payload. |
| `401` | Token ausente, inválido o expirado; app bloqueada. | Renovar el JWT en `/auth/login`. |
| `403` | La app no tiene el servicio o el comando requerido. | Solicitar asignación al administrador. |
| `404` | Recurso o transacción no encontrada, o pertenece a otra app. | Verificar identificadores. |
| `409` | Conflicto, por ejemplo identificador duplicado. | Revisar los datos. |
| `429` | Demasiadas peticiones. | Esperar y reintentar con backoff. |
| `503` | Microservicio no disponible. | Reintentar; el cuerpo incluye `code: MICROSERVICIO_NO_DISPONIBLE`. |

Límites por defecto:

- `100` peticiones por minuto por IP.
- `5` intentos de login por minuto por IP.
- `10` peticiones por minuto por app autenticada.
- Timeout del gateway hacia el microservicio: `5` segundos.

Recomendaciones:

- Reintentar sólo errores `503` o `429`, con backoff exponencial y límite de
  intentos.
- No reintentar automáticamente un `POST` de pago/transferencia sin una clave
  de idempotencia o sin verificar antes el estado de la transacción.
  Ver [la sección de Idempotencia](#idempotencia-idempotency-key).
- Usar una `referencia` única por operación y conservar la respuesta.

### 9. Buenas prácticas de seguridad

- Usar siempre HTTPS en producción.
- Guardar `app_key` y `encryptionKey` en un gestor de secretos, nunca en el
  código ni en repositorios.
- No registrar el JWT, la `app_key` ni la `encryptionKey` en logs.
- Mantener el JWT en memoria o en almacenamiento seguro del servidor.
- No compartir credenciales entre apps: cada integración debe tener su propia
  app registrada.
- Solicitar la rotación de credenciales al administrador si se sospecha una
  filtración (`nuevokey_app` / `nuevoencryptionkey_app`).
- No exponer el microservicio ni PostgreSQL fuera de la red interna.

---

### 10. `referenciaLote`: cómo guardarla y consultarla

#### Al crear el lote

`POST /tramas-produbanco/transferencia-nacional` (y `transferencia-internacional`)
devuelve la referencia **cifrada**, con el formato `iv:authTag:cipher` en base64:

```json
{
  "referenciaLote": "kWScxTNB/g4YtmVe:d1vLidWtZDF6EvNspXQG3g==:jrsLi81gk9SZK2G4glBP0jX3Ehh1Az0y5EIVwxXOPsBjGR68S/k=",
  "montoTotal": 5
}
```

**Guardala tal cual**: es el identificador que el cliente conserva para
consultar el estado después. No hace falta descifrarla ni volver a cifrarla.

#### Al consultar el detalle

`GET /tramas-produbanco/transacciones/estado/:dato` acepta **tres formas**:

| `:dato` | Ejemplo |
|---|---|
| `idTransaccion` (numérico) | `32` |
| `referenciaLote` en claro | `LOTE-2026-0001` |
| `referenciaLote` cifrada (la que devolvió el POST) | `kWScxTNB/g4YtmVe:d1vLidWt...` |

El **mismo criterio** aplica al endpoint de administración
`GET /admin/produbanco/transacciones/estado/:dato` (servicio `ADMIN_APPS`),
que además acepta el query opcional `idApp` para acotar la búsqueda a una app:

```bash
# Cifrada, sin acotar por app
curl "http://localhost:3000/admin/produbanco/transacciones/estado/$ENC" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Cifrada, acotada a la app dueña
curl "http://localhost:3000/admin/produbanco/transacciones/estado/$ENC?idApp=17" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Si se envía `idApp` y la transacción pertenece a otra app, responde `404`
sin revelar que existe.

La cifrada **debe ir URL-encoded** porque contiene `/`, `:` y `=`:

```bash
REF='kWScxTNB/g4YtmVe:d1vLidWtZDF6EvNspXQG3g==:jrsLi81gk9SZK2G4glBP0jX3Ehh1Az0y5EIVwxXOPsBjGR68S/k='
ENC=$(python -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1], safe=''))" "$REF")

curl "http://localhost:3000/tramas-produbanco/transacciones/estado/$ENC" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Encryption-Key: <encryptionKey>"
```

En PowerShell:

```powershell
$ref = 'kWScxTNB/g4YtmVe:d1vLidWtZDF6EvNspXQG3g==:jrsLi81gk9SZK2G4glBP0jX3Ehh1Az0y5EIVwxXOPsBjGR68S/k='
$enc = [uri]::EscapeDataString($ref)
Invoke-RestMethod -Headers @{ Authorization = "Bearer $token"; "X-Encryption-Key" = $key } `
  "http://localhost:3000/tramas-produbanco/transacciones/estado/$enc"
```

> **Importante:** no decodifiques la referencia antes de enviarla; el gateway
> y el microservicio la comparan contra el valor cifrado almacenado. Tampoco
> la cortes: el `=` final del base64 forma parte del valor.

#### Diferencia con el listado

`GET /tramas-produbanco/transacciones` y el detalle devuelven `referenciaLote`
**en claro** (el microservicio la descifra con la `encryptionKey` de la app).
Es decir:

- **Respuesta del POST (crear):** `referenciaLote` cifrada.
- **Listado y detalle (GET):** `referenciaLote` en claro.

Ambas formas son válidas como `:dato` en la consulta de estado, así que el
cliente puede guardar la que recibe del POST y usarla directamente.

#### Campos que ve la app cliente

Las respuestas de los endpoints de app cliente
(`/tramas-produbanco/transacciones` y `/tramas-produbanco/transacciones/estado/:dato`)
**no incluyen** los campos internos de la operación:

| Campo | ¿Cliente? | ¿Admin? |
|---|---|---|
| `idTransaccion` | ❌ | ✅ |
| `operacion` | ❌ | ✅ |
| `status` | ❌ | ✅ |
| `estadoTransaccion` | ❌ | ✅ |
| `cargaRespuestaBanco` | ❌ | ✅ |
| `referenciaLote` | ✅ | ✅ |
| `statusServicio` | ✅ | ✅ |
| `codigoBanco`, `mensajeBanco`, `fechaConsultaBanco` | ✅ | ✅ |
| `envioId`, `errorMessage`, `fechaCreacion` | ✅ | ✅ |
| `beneficiario*`, `registros`, `montoTotal`, `estadosDetalle`, `detalles` | ✅ | ✅ |
| `entregados`, `entregaEfectiva`, `detalles[].entregaEfectiva` | ✅ | ✅ |

El cliente identifica la operación por `referenciaLote`, no por `idTransaccion`.
Los campos internos sólo aparecen en:

- `GET /admin/produbanco/transacciones`
- `GET /admin/produbanco/transacciones/estado/:dato`

Fuera de esos cinco campos internos, **la respuesta del admin es la misma que
la del cliente**, y le agrega sólo metadatos de la app
(`appId`, `appIdentificador`, `appNombre`) y, en el detalle, `banco` con la
respuesta en vivo. Así un mismo consumidor puede reutilizar el parseo entre
ambos endpoints.

#### Cómo saber si la operación salió bien

Para la app cliente, el **único** indicador de estado de la cabecera es
`statusServicio`. El campo numérico `status` y el estado verbatim del banco
(`estadoTransaccion`) son internos y sólo los ve el admin.

Valores posibles de `statusServicio`:

| Valor | Significado | Qué hacer |
|---|---|---|
| `PENDIENTE` | Enviada, aún sin respuesta definitiva del banco. | Consultar el estado más tarde; no reenviar. |
| `PROCESADO_BANCO` | **La operación fue procesada por el banco.** | Éxito: usar `detalles[].estadoItem` para el resultado de cada ítem. |
| `INCIERTO` | No se pudo confirmar el resultado (timeout, corte, respuesta incompleta). | Volver a consultar el estado; **no** reenviar con una llave nueva. |
| `ERROR` | El banco o la validación rechazaron la operación. | Revisar `errorMessage` y `codigoBanco` / `mensajeBanco`. |
| `DESCONOCIDO` | Estado no mapeado (dato legado). | Tratar como `INCIERTO` y consultar. |

Regla práctica para el cliente:

```text
statusServicio === "PROCESADO_BANCO"  → operación exitosa
statusServicio === "PENDIENTE" | "INCIERTO" | "DESCONOCIDO" → volver a consultar
statusServicio === "ERROR"            → falló; no reintentar sin corregir
```

> `PROCESADO_BANCO` indica que el **lote** fue procesado. El resultado final de
> cada pago está en `detalles[].estadoItem` (y su `codigoRespuesta` /
> `mensajeBanco`), porque un lote puede procesarse con ítems aprobados y otros
> rechazados.

#### Entrega efectiva del dinero

`detalles[].estadoItem` se devuelve **tal cual lo reporta Produbanco**
(`Pendiente de envio por el banco`, `Aplica al banco`, `PROCESO OK`,
`ENTREGADO OK`, `PROCESADAS ERROR`, `REVOCADO`, etc.). Es el estado oficial y
sirve para trazabilidad.

Para no obligar al cliente a interpretar la redacción del banco, cada ítem
incluye además:

| Campo | Tipo | Significado |
|---|---|---|
| `detalles[].entregaEfectiva` | `boolean` | `true` sólo cuando Produbanco reportó `ENTREGADO OK`: **el dinero fue entregado de forma efectiva en la cuenta del beneficiario de ese ítem**. |
| `totales.entregados` | `number` | Cantidad de ítems con `entregaEfectiva = true`. |
| `totales.entregaEfectiva` | `boolean` | `true` sólo si **todos** los ítems del lote fueron entregados (y hay al menos uno). |

El **listado** (`GET /tramas-produbanco/transacciones` y su equivalente admin)
expone el mismo criterio con los mismos nombres, pero a nivel de ítem de la
página:

| Campo (en cada `items[]`) | Tipo | Significado |
|---|---|---|
| `entregados` | `number` | Ítems del lote con entrega efectiva. |
| `entregaEfectiva` | `boolean` | `true` si todos los ítems del lote fueron entregados. |

Así, listado y detalle responden con la misma semántica: `entregados` /
`entregaEfectiva` en ambos, y el detalle además lo repite por ítem en
`detalles[].entregaEfectiva`.

Ejemplo de un ítem entregado:

```json
{
  "secuencia": 1,
  "nombre": "JUAN PEREZ",
  "cuenta": "2203456789",
  "bancoCodigo": "0102",
  "monto": 5,
  "estadoItem": "ENTREGADO OK",
  "entregaEfectiva": true,
  "codigoRespuesta": "00",
  "mensajeBanco": "PROCESADO OK"
}
```

Reglas para el cliente:

- `estadoItem` → qué dice el banco, sin interpretación (mostrar si se quiere).
- `entregaEfectiva === true` → **confirmado: el dinero llegó a la cuenta**.
- `entregaEfectiva === false` → todavía no hay constancia de entrega: volver a
  consultar el estado; no asumir éxito ni reenviar el pago.

> La comparación es tolerante a mayúsculas y espacios (`ENTREGADO OK`,
> `entregado ok`, `Entregado`). Cualquier otro valor —incluido
> `NO ENTREGADO`— devuelve `false`.

#### Errores asociados

| Caso | Respuesta |
|---|---|
| `dato` vacío | `400` — `dato es requerido (idTransaccion o referenciaLote)` |
| Referencia inexistente o de otra app | `404` — `Transacción no encontrada.` |
| Falta `X-Encryption-Key` | `400` |
| `encryptionKey` inválida | `401`/`403` según validación de credenciales |

---

# Idempotencia (`Idempotency-Key`)

La idempotencia es un requisito **transversal**: no pertenece a un servicio en
particular, sino a **todos los endpoints que crean una operación** (pagos,
transferencias, tokenización de tarjetas y las que se agreguen a futuro).

En todos ellos el mecanismo es el mismo:

```http
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

Si el header falta, la operación **no se ejecuta** y el gateway responde `400`.
Es decir, el sistema falla cerrado: sin llave no hay operación.

---

## 1. Endpoints que la requieren hoy

| Endpoint | Servicio requerido | Qué crea |
|---|---|---|
| `POST /tramas-produbanco/transferencia-nacional` | `SPR_PRODUBANCO` | Lote de pagos nacionales |
| `POST /tramas-produbanco/transferencia-internacional` | `SPR_PRODUBANCO` | Lote de transferencias internacionales |
| `POST /guardar-tarjeta` | `SRV_FIRSTOKEN` | Tokenización de tarjeta |

> Esta tabla se amplía a medida que se agregan operaciones nuevas. La regla es
> simple: **si el endpoint crea algo, exige `Idempotency-Key`**.

---

## 2. Qué es y cómo funciona

La llave la genera **la app cliente**, nunca el servidor.

El servidor la guarda junto con la operación y la usa como candado:

- **Primera petición:** se ejecuta y se asocia la llave a la operación creada.
- **Reintento con la misma llave:** no se crea otra operación; se devuelve el
  resultado de la primera ejecución.
- **Petición simultánea con la misma llave:** una gana y la otra recibe un
  conflicto mientras la primera sigue en curso.

Esto cubre los casos típicos de duplicado: timeout del cliente, caída de red
después de enviar, doble clic en un botón, reintentos automáticos del gateway
o de un balanceador.

La llave se relaciona con la app: el candado es `(idApp, Idempotency-Key)`.
Dos apps distintas pueden usar el mismo UUID sin interferirse.

---

## 3. Reglas del valor

- **Tipo:** texto libre (se normaliza con `trim`).
- **Longitud máxima:** `100` caracteres (coincide con la columna en BD).
- **Formato recomendado:** UUID v4.
- **No es un secreto:** no cifra ni autentica nada. Puede viajar en logs, pero
  no conviene exponerlo innecesariamente.
- **Una llave por operación lógica**, no por endpoint ni por app:
  - misma operación + reintento → **misma** llave;
  - operación distinta → **llave nueva**.
- **No derivar la llave del contenido** del pago (monto, cuenta, cédula): dos
  operaciones legítimas idénticas deben poder existir.

---

## 4. Cómo generar una

Powershell:

```powershell
[guid]::NewGuid().ToString()
# 550e8400-e29b-41d4-a716-446655440000
```

Node.js:

```js
crypto.randomUUID();
```

Bash (Linux/macOS):

```bash
uuidgen | tr '[:upper:]' '[:lower:]'
```

Python:

```python
import uuid
str(uuid.uuid4())
```

Postman / Insomnia: usá la variable dinámica `{{$guid}}` como valor del header.

---

## 5. Cómo enviarla

El nombre exacto del header es **`Idempotency-Key`** (HTTP no distingue
mayúsculas/minúsculas, pero documentalo así).

```http
POST /tramas-produbanco/transferencia-nacional HTTP/1.1
Authorization: Bearer <access_token>
Content-Type: application/json
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

`curl`:

```bash
IDEMPOTENCY_KEY=$(uuidgen)

curl -X POST http://localhost:3000/tramas-produbanco/transferencia-nacional \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d @pago.json
```

PowerShell:

```powershell
$key = [guid]::NewGuid().ToString()
Invoke-RestMethod -Method Post `
  -Uri http://localhost:3000/tramas-produbanco/transferencia-nacional `
  -Headers @{ Authorization = "Bearer $token"; "Idempotency-Key" = $key } `
  -ContentType "application/json" `
  -Body (Get-Content pago.json -Raw)
```

---

## 6. Flujo recomendado en la app cliente

1. **Antes de llamar:** generá un UUID y guardalo junto al borrador de la
   operación (en memoria o en tu BD), no después de la respuesta.
2. **Enviá** la petición con ese header.
3. **Si hay timeout o error de red (5xx/503):** reintentá con **la misma**
   llave y **el mismo payload**. Si la primera llamada sí llegó, el servidor
   devuelve ese resultado en lugar de duplicar.
4. **Si la operación terminó bien:** guardá la llave junto al `idTransaccion` /
   `referenciaLote` para trazabilidad.
5. **Para una operación nueva:** generá una llave nueva, aunque el payload sea
   idéntico al anterior.

> No reutilices una llave "para siempre" por app ni la generes al momento de
> reintentar: eso anula el beneficio y puede bloquear operaciones distintas.

---

## 7. Cómo probar la idempotencia

1. Generá una llave y guardala: `$key = [guid]::NewGuid().ToString()`.
2. Enviá la petición. Anotá la respuesta (por ejemplo `referenciaLote`).
3. **Reintento correcto:** enviá el **mismo payload** con la **misma** llave.
   Debe responder lo mismo y no crear una transacción nueva (verificalo en
   `GET /tramas-produbanco/transacciones`).
4. **Operación distinta:** generá una llave nueva con el mismo payload. Ahora
   sí se crea otra operación: el sistema deduplica por llave, no por contenido.

---

## 8. Errores asociados

| Caso | Respuesta |
|---|---|
| Header ausente o vacío | `400` — `Falta el header Idempotency-Key...` |
| Más de 100 caracteres | `400` — `El header Idempotency-Key supera el máximo de 100 caracteres.` |
| Misma llave mientras la primera operación sigue en curso | Conflicto con `Ya hay una operación en curso con esta Idempotency-Key.` |
| Misma llave, mismo payload, operación ya terminada | Se devuelve el resultado original (no se duplica) |

---

## 9. En Swagger

La UI (`/doc`) muestra **`Idempotency-Key`** como header requerido en cada
endpoint que la exige. Podés pegar cualquier UUID ahí y ejecutar la prueba
desde el navegador.

---

## 10. Buenas prácticas

- Generá la llave **antes** de la primera llamada, no en el reintento.
- Persistila junto al estado de la operación para poder reintentar días después.
- No la derives del contenido del pago ni de un contador global compartido.
- Mantenela por debajo de 100 caracteres (un UUID entra holgado).
- Tratala como metadato de trazabilidad: útil en logs, no es un secreto.

---

# Documentación de la app administradora (`admin_app`)

## Credenciales de la app administradora

```text
app_id (identificador_app): admin_app
app_key (key):              admin_app_1234
```

> La `key` se usa únicamente para iniciar sesión. En base de datos se guarda
> hasheada (scrypt), por lo que no se puede recuperar si se pierde.

---

## 1. ¿Qué es la app administradora?

`admin_app` es la aplicación consumidora con permisos para **administrar el
microservicio**: registrar y mantener apps consumidoras, gestionar sus
credenciales, asignar o quitar servicios y habilitar/deshabilitar servicios
de forma global o por app.

Sólo debe existir **una** app administradora en el sistema: no se permite
asignar a otras apps servicios cuyo código empiece por `ADMIN`.

---

## 2. Autenticación y permisos

### 2.1 Iniciar sesión

```http
POST /auth/login
Content-Type: application/json
```

```json
{
  "app_id": "admin_app",
  "app_key": "admin_app_1234"
}
```

Respuesta:

```json
{
  "access_token": "<JWT>",
  "expires_in": 3600
}
```

- El JWT dura **1 hora**.
- En cada petición se envía el header:

```http
Authorization: Bearer <access_token>
```

- El gateway **revalida en cada request** contra el microservicio la app, sus
  servicios y sus permisos vigentes. Por eso, si a `admin_app` se le quita un
  servicio o un comando, la sesión deja de funcionar de inmediato.

### 2.2 Doble candado de permisos

Cada endpoint administrativo exige dos cosas a la vez:

1. **Servicio asignado** a la app:
   - `ADMIN_APPS` para los endpoints de `/admin/*` (apps y servicios).
2. **Comando (`cmp`) permitido** dentro de la jerarquía
   `servicios → servicios_controladores → controladores`.

Si falta el servicio → `403` indicando el servicio faltante.
Si falta el comando → `403` indicando la acción no permitida.

### 2.3 Jerarquía de activación de un servicio

Un servicio está disponible para una app sólo si se cumplen los tres niveles:

| Nivel | Campo | Efecto |
|---|---|---|
| App | `app.activo` | Si es `false`, la app no puede autenticarse ni operar. |
| Servicio global | `servicios.activo` | Si es `false`, ninguna app puede usar el servicio. |
| Asignación por app | `app_servicios.activo` | Si es `false`, esa app en particular no puede usar el servicio. |

En los tres casos, `NULL` se interpreta como **activo**.

---

## 3. Resumen de capacidades

| Capacidad | Método y ruta | Comando requerido |
|---|---|---|
| Registrar una app consumidora | `POST /admin/registrar_app` | `registrar_app` |
| Listar apps registradas | `GET /admin/listar_apps` | `listar_apps` |
| Actualizar datos de una app | `POST /admin/actualizar_app` | `actualizar_app` |
| Bloquear una app | `POST /admin/bloquear_app` | `bloquear_app` |
| Regenerar la `key` de una app | `POST /admin/nuevokey_app` | `nuevokey_app` |
| Regenerar la `encryptionKey` de una app | `POST /admin/nuevoencryptionkey_app` | `nuevoencryptionkey_app` |
| Listar el catálogo de servicios | `GET /admin/listar-servicios` | `listar_servicios` |
| Asignar servicios a una app | `POST /admin/asignar-servicios-app` | `asignar_servicios_app` |
| Desasignar servicios de una app | `POST /admin/desasignar-servicios-app` | `desasignar_servicios_app` |
| Activar/desactivar un servicio en una app | `POST /admin/activar-desactivar-servicio-app` | `activar_desactivar_servicio_app` |
| Activar/desactivar un servicio globalmente | `POST /admin/activar-desactivar-servicio` | `activar_desactivar_servicio` |

---

## 4. Gestión de apps consumidoras

### 4.1 Registrar una nueva app

```http
POST /admin/registrar_app
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "identificador_app": "mi-app-nueva",
  "nombre": "Mi Aplicación",
  "desarrollador": "Acme Cía. Ltda.",
  "ruc": "1790012345001",
  "email": "desarrollador@ejemplo.com",
  "activo": true
}
```

Campos:

| Campo | Obligatorio | Descripción |
|---|---|---|
| `identificador_app` | Sí | 3 a 50 caracteres, minúsculas, sin espacios. Sólo `a-z`, `0-9`, `_` y `-`. Es el `app_id` del login. |
| `nombre` | No | Nombre comercial (máx. 300). |
| `desarrollador` | No | Desarrollador o empresa (máx. 100). |
| `ruc` | No | RUC (máx. 200). |
| `email` | No | Email de contacto del desarrollador (máx. 200). |
| `activo` | No | Estado inicial. Por defecto `true`. |

Respuesta (`201`):

```json
{
  "id_app": 12,
  "identificador_app": "mi-app-nueva",
  "activo": true,
  "key": "<key-en-claro>",
  "encryptionKey": "<encryptionKey-en-claro>",
  "info_app": { "...": "..." },
  "servicios": [],
  "mensaje": "App registrada. Guardá estas credenciales..."
}
```

Consideraciones:

- La `key` y la `encryptionKey` las genera el servidor.
- Se devuelven **en claro una única vez**. La `key` queda hasheada y no se
  puede recuperar.
- La app nace **sin servicios asignados**. Hay que asignarlos después con
  `asignar-servicios-app`.
- El identificador debe ser único: si ya existe → `409 Conflict`.

### 4.2 Listar apps registradas

```http
GET /admin/listar_apps
Authorization: Bearer <access_token>
```

Devuelve, por cada app:

```json
[
  {
    "id_app": 12,
    "identificador_app": "mi-app-nueva",
    "activo": true,
    "info_app": {
      "nombre": "Mi Aplicación",
      "desarrollador": "Acme Cía. Ltda.",
      "ruc": "1790012345001",
      "email": "desarrollador@ejemplo.com"
    }
  }
]
```

No devuelve `key` ni `encryptionKey`.

### 4.3 Actualizar datos de una app

```http
POST /admin/actualizar_app
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "idApp": 12,
  "data": {
    "identificador_app": "mi-app-nueva",
    "nombre": "Mi Aplicación S.A.",
    "desarrollador": "Acme Cía. Ltda.",
    "ruc": "1790012345001",
    "email": "desarrollador@ejemplo.com"
  }
}
```

- `idApp` es la app **objetivo** a modificar.
- `data.identificador_app` es obligatorio.
- No devuelve ni modifica `key` ni `encryptionKey`.
- Si la app no existe → `404`.

### 4.4 Bloquear una app

```http
POST /admin/bloquear_app
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{ "id_app": 12 }
```

- Pone `app.activo = false`.
- La app bloqueada ya no puede autenticarse en `/auth/login` ni operar a
  través del gateway: en la siguiente petición el gateway revalida contra la
  base de datos y la rechaza con `401`.
- **Una app no puede bloquearse a sí misma** → `400`.
- Si ya estaba bloqueada → `409`.
- Si no existe → `404`.

Respuesta:

```json
{
  "id_app": 12,
  "identificador_app": "mi-app-nueva",
  "activo": false,
  "mensaje": "App mi-app-nueva bloqueada..."
}
```

### 4.5 Regenerar la `key` de una app

```http
POST /admin/nuevokey_app
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{ "idApp": 12 }
```

- Genera una nueva `key` aleatoria para la app objetivo.
- La nueva `key` se devuelve **en claro una única vez**.
- La `key` anterior deja de funcionar para nuevos logins.
- La app debe actualizar su configuración con la nueva key.
- **Una app no puede regenerar su propia key** → `400`.
- Si la app no existe → `404`.

### 4.6 Regenerar la `encryptionKey` de una app

```http
POST /admin/nuevoencryptionkey_app
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{ "idApp": 12 }
```

- Genera una nueva `encryptionKey` para la app objetivo.
- Se devuelve **en claro una única vez**.
- Sirve para cifrar/descifrar payloads y para los hashes de búsqueda de esa
  app: la app debe actualizar su configuración con la nueva llave.
- **Una app no puede regenerar su propia encryptionKey** → `400`.
- Si la app no existe → `404`.

---

## 5. Gestión de servicios y asignaciones

### 5.1 Listar el catálogo de servicios

```http
GET /admin/listar-servicios
Authorization: Bearer <access_token>
```

Devuelve:

```json
[
  {
    "codigo": "SPR_PRODUBANCO",
    "nombre": "Produbanco",
    "descripcion": "...",
    "activo": true
  }
]
```

- Incluye servicios activos e inactivos.
- **Excluye** los servicios cuyo código empieza por `ADMIN`, para que no se
  puedan asignar a otras apps.

### 5.2 Asignar servicios a una app

```http
POST /admin/asignar-servicios-app
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "idApp": 12,
  "codigos": ["SPR_PRODUBANCO", "SRV_FIRSTOKEN"]
}
```

Comportamiento:

- Reemplaza **todas** las asignaciones previas de esa app: primero elimina
  las filas existentes en `app_servicios` y luego crea las nuevas.
- Deduplica los códigos recibidos.
- Sólo acepta servicios que existan y estén **activos globalmente**.
- Si algún código no existe o está inactivo → `400` indicando cuáles.
- No permite códigos que empiecen por `ADMIN` → `400`.
- Devuelve la lista actual de servicios asignados:

```json
[
  { "id_servicio": 3, "codigo": "SPR_PRODUBANCO", "nombre": "Produbanco" },
  { "id_servicio": 7, "codigo": "SRV_FIRSTOKEN", "nombre": "Firstoken" }
]
```

### 5.3 Desasignar servicios de una app

```http
POST /admin/desasignar-servicios-app
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "idApp": 12,
  "codigos": ["SRV_FIRSTOKEN"]
}
```

- Elimina **sólo** las asignaciones indicadas; las demás se mantienen.
- Permite quitar la asignación aunque el servicio esté inactivo globalmente.
- Si algún código no existe → `400` indicando cuáles.
- No permite códigos que empiecen por `ADMIN` → `400`.
- Devuelve los códigos desasignados y los servicios restantes:

```json
{
  "codigosDesasignados": ["SRV_FIRSTOKEN"],
  "serviciosRestantes": [
    {
      "id_servicio": 3,
      "codigo": "SPR_PRODUBANCO",
      "nombre": "Produbanco",
      "activo": true
    }
  ]
}
```

### 5.4 Activar/desactivar un servicio en una app

```http
POST /admin/activar-desactivar-servicio-app
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "idApp": 12,
  "codigo": "SPR_PRODUBANCO",
  "activo": false
}
```

- Cambia **sólo** `app_servicios.activo` para esa app.
- La relación se mantiene: es la alternativa reversible a desasignar.
- `true` vuelve a habilitar el servicio para la app.
- `false` se lo quita a esa app, sin afectar a las demás.
- No modifica el estado global `servicios.activo`.
- El servicio debe estar previamente asignado a la app; si no → `404`.
- Si el código no existe → `404`.

### 5.5 Activar/desactivar un servicio globalmente

```http
POST /admin/activar-desactivar-servicio
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{ "idServicio": 3 }
```

- Hace **toggle** del estado global del servicio: si estaba activo lo
  desactiva y viceversa.
- Afecta a **todas** las apps, aunque tengan la asignación activa.
- `NULL` en `servicios.activo` se considera activo.
- Si el servicio no existe → `404`.

Respuesta:

```json
{ "id_servicio": 3, "codigo": "SPR_PRODUBANCO", "activo": false }
```

---

## 6. Auditoría de las acciones administrativas

Todas las operaciones de administración quedan registradas en la tabla
`transacciones_servicios` con:

- `servicio = 'ADMIN_APPS'`
- `idApp` = app administradora que ejecutó la acción
- `operation` = nombre de la operación
- `entidadId` / `entidadName` = app o servicio afectado
- `requestPayload`, `responsePayload`, `status` y `errorMessage`
- Resultado exitoso o fallido

Operaciones auditadas:

| Operación | Acción |
|---|---|
| `ADMIN_CREAR_APP` | Alta de app. |
| `ADMIN_BLOQUEAR_APP` | Bloqueo de app. |
| `ADMIN_LISTAR_APPS` | Listado de apps. |
| `ADMIN_ACTUALIZAR_APP` | Actualización de datos. |
| `ADMIN_NUEVA_KEY_APP` | Regeneración de `key`. |
| `ADMIN_NUEVA_ENCRYPTION_KEY_APP` | Regeneración de `encryptionKey`. |
| `ADMIN_ASIGNAR_SERVICIOS_APP` | Asignación de servicios. |
| `ADMIN_DESASIGNAR_SERVICIOS_APP` | Desasignación de servicios. |
| `ADMIN_CAMBIAR_ESTADO_SERVICIO_APP` | Activación/desactivación por app. |
| `ADMIN_TOGLEAR_SERVICIO` | Activación/desactivación global. |

Las credenciales (`key`, `encryptionKey`) se enmascaran como `***` antes de
guardarse en la auditoría.

---

## 7. Restricciones y consideraciones de seguridad

- La app administradora **no puede bloquearse a sí misma**.
- La app administradora **no puede regenerar su propia `key`** ni su propia
  `encryptionKey`.
- No se pueden asignar ni desasignar servicios con código que empiece por
  `ADMIN`: sólo debe existir un administrador.
- El bloqueo de una app y los cambios de servicios se revalidan en cada
  petición del gateway, por lo que surten efecto sin esperar a que expire el
  JWT. Regenerar la `key` o la `encryptionKey` no invalida un JWT ya emitido;
  afecta a los nuevos logins y a la configuración de los servicios.
- Guardar las credenciales devueltas por `registrar_app`, `nuevokey_app` y
  `nuevoencryptionkey_app`: no se pueden volver a consultar.
- El JWT expira a la hora; ante `401` hay que volver a autenticarse en
  `/auth/login`.

---

## 8. Códigos de error habituales

| Código | Significado |
|---|---|
| `400` | Datos inválidos, código de servicio inválido o acción no permitida (por ejemplo, bloquearse a sí misma). |
| `401` | Token ausente, inválido o expirado; app bloqueada o eliminada. |
| `403` | La app no tiene el servicio o el comando requerido. |
| `404` | App, servicio o asignación no encontrada. |
| `409` | Conflicto: identificador duplicado o app ya bloqueada. |
| `429` | Demasiados intentos de login. |
| `503` | Microservicio no disponible. |

---

## 9. Ejemplo rápido

```bash
# 1. Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"app_id":"admin_app","app_key":"admin_app_1234"}'

# 2. Registrar una app (usar el access_token del paso 1)
curl -X POST http://localhost:3000/admin/registrar_app \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"identificador_app":"mi-app-nueva","nombre":"Mi Aplicación"}'

# 3. Asignarle servicios
curl -X POST http://localhost:3000/admin/asignar-servicios-app \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"idApp":12,"codigos":["SPR_PRODUBANCO"]}'

# 4. Listar apps
curl http://localhost:3000/admin/listar_apps \
  -H "Authorization: Bearer <access_token>"
```
