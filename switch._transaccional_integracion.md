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
  "ruc": "1790012345001"
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
