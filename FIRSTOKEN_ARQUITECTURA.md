# Módulo Firstoken — Arquitectura e Implementación

> Documento técnico del módulo de tokenización y pagos con Firstoken para IguanaPay.
> Última revisión: 2026-04-23 (rama `refactor-loans`).

---

## 1. Propósito del módulo

El módulo Firstoken encapsula la integración con la pasarela **Firstoken** para permitir a los usuarios de IguanaPay:

1. **Registrar tarjetas de crédito/débito** en forma segura (tokenización), evitando almacenar PAN/CVV en la base de datos.
2. **Cobrar** usando un token permanente, con o sin CVV (one-shot).
3. **Autorizar + capturar** pagos en flujo de dos pasos (reservar fondos y capturar más tarde).
4. **Reembolsar** y **anular** pagos.
5. **Consultar estado** de transacciones.

**Objetivo de cumplimiento:** minimizar alcance PCI-DSS. IguanaPay nunca persiste PAN ni CVV; Firstoken devuelve un token opaco (`UUID`) que es lo único que se guarda (encriptado en reposo).

---

## 2. Arquitectura en capas

```
┌──────────────────────────────────────────────────────────────────┐
│  HTTP Layer  (Controllers, FormRequests, Resources, Policies)    │
│  • TokenizedCardController / TokenizedPaymentController          │
└──────────────────────────────────────────────────────────────────┘
                                │
┌──────────────────────────────────────────────────────────────────┐
│  Service Layer  (Orquestación, reglas de negocio)                │
│  • TokenizedCardService     — ciclo de vida de tarjetas (CRUD)   │
│  • TokenizedPaymentService  — operaciones de pago                │
│  • TokenizedCardLogger      — auditoría + sanitización           │
│  • PayloadSanitizer         — enmascaramiento PCI                │
└──────────────────────────────────────────────────────────────────┘
                                │
┌──────────────────────────────────────────────────────────────────┐
│  Client Layer  (HTTP client hacia Firstoken)                     │
│  • FirstokenService  — cliente único, 4 APIs distintas           │
└──────────────────────────────────────────────────────────────────┘
                                │
┌──────────────────────────────────────────────────────────────────┐
│  DTO Layer  (objetos inmutables de request/response)             │
│  • CardData, PaymentRequest, PaymentResult,                      │
│    PermanentTokenResult, TokenResult, ProxyRequest, ProxyResponse│
└──────────────────────────────────────────────────────────────────┘
                                │
┌──────────────────────────────────────────────────────────────────┐
│  Persistence Layer  (Eloquent)                                   │
│  • TokenizedCard, TokenizedCardTransaction                       │
└──────────────────────────────────────────────────────────────────┘
```

**Regla de dependencia:** flecha de arriba hacia abajo. Un controller nunca llama directo a `FirstokenService` — siempre pasa por un service de alto nivel (`TokenizedCardService`, `TokenizedPaymentService`). Esto preserva la invariante de que cada operación se loguea y se emite el evento correspondiente.

---

## 3. Estructura de archivos

```
core/
├── app/
│   ├── Console/Commands/
│   │   └── FirstokenSmokeTest.php                    # Smoke test 7 pasos
│   │
│   ├── Events/
│   │   ├── CardTokenized.php                         # Emitido al crear tarjeta
│   │   ├── CardActivated.php                         # Tras verificación $0
│   │   ├── PaymentProcessed.php                      # Tras charge (auth+capture o bundled)
│   │   └── PaymentCaptured.php                       # Tras captureAuthorization()
│   │
│   ├── Exceptions/Firstoken/
│   │   ├── FirstokenException.php                    # Base abstracta
│   │   ├── FirstokenAuthException.php                # 401/403
│   │   ├── FirstokenConnectionException.php          # Timeouts/DNS
│   │   ├── TokenizationFailedException.php           # Fallo en tokenize*
│   │   ├── PaymentAuthorizationFailedException.php   # authorize() rechazado
│   │   ├── PaymentProcessingException.php            # Error envelope para el user
│   │   ├── CardVerificationFailedException.php       # $0 auth no aprueba
│   │   ├── CardNotActiveException.php                # Estado inválido
│   │   ├── CardNotFoundException.php                 # Card no existe
│   │   └── CardOwnershipException.php                # Card de otro user
│   │
│   ├── Http/
│   │   ├── Controllers/Api/User/
│   │   │   ├── TokenizedCardController.php           # CRUD de tarjetas
│   │   │   └── TokenizedPaymentController.php        # Cobros/capturas/refund/void/status
│   │   ├── Requests/
│   │   │   ├── StoreTokenizedCardRequest.php
│   │   │   ├── TokenizedPaymentRequest.php
│   │   │   ├── TokenizedPaymentWithCvvRequest.php
│   │   │   ├── CapturePaymentRequest.php
│   │   │   ├── RefundPaymentRequest.php
│   │   │   └── VoidPaymentRequest.php
│   │   ├── Resources/
│   │   │   └── TokenizedCardResource.php             # Serialización segura
│   │   └── Middleware/
│   │       └── ForceJsonResponse.php                 # Accept: application/json en /api/*
│   │
│   ├── Models/
│   │   ├── TokenizedCard.php
│   │   └── TokenizedCardTransaction.php
│   │
│   ├── Policies/
│   │   └── TokenizedCardPolicy.php                   # view/pay/delete
│   │
│   └── Services/Firstoken/
│       ├── FirstokenService.php                      # Cliente HTTP único
│       ├── TokenizedCardService.php                  # Ciclo de vida de tarjeta
│       ├── TokenizedPaymentService.php               # Operaciones de pago
│       ├── TokenizedCardLogger.php                   # Audit trail
│       ├── PayloadSanitizer.php                      # Enmascarado PCI
│       └── DTOs/
│           ├── CardData.php
│           ├── PaymentRequest.php
│           ├── PaymentResult.php
│           ├── PermanentTokenResult.php
│           ├── TokenResult.php
│           ├── ProxyRequest.php
│           └── ProxyResponse.php
│
├── config/
│   └── firstoken.php                                 # Config central
│
├── database/migrations/
│   ├── 2026_04_16_105000_create_tokenized_cards_table.php
│   └── 2026_04_16_114123_create_tokenized_card_transactions_table.php
│
└── routes/api/
    └── tokenized_cards.php                           # Rutas del módulo
```

---

## 4. Modelo de datos

### 4.1 `tokenized_cards`

Representa una tarjeta registrada por un usuario. **No contiene PAN/CVV** — sólo metadata visible y el token opaco (encriptado).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | bigint PK | |
| `user_id` | FK users | |
| `firstoken_token` | text | **Encriptado** vía cast `encrypted` de Laravel |
| `card_truncated` | string(25) | ej. `411111******1111` |
| `franchise` | string(20) | `visa`, `mastercard`, etc. |
| `holder_name` | string(100) | Normalizado a UPPER en `CardData` |
| `expiration_month` | string(2) | |
| `expiration_year` | string(4) | |
| `last_four` | string(4) | Atajo para UI |
| `status` | enum | `PENDING` / `ACTIVE` / `REVOKED` |
| `scheme` | string(5) | payment_scheme Firstoken (`'7'` por defecto) |
| `metadata` | json | Payload extra (tags, ids de procesador, etc.) |
| `timestamps` | | |
| `deleted_at` | | **Soft delete** — el token en Firstoken se elimina, pero el row se conserva para auditoría |

**Invariantes:**
- `(user_id, firstoken_token)` es único lógicamente (no se fuerza en DB por ser columna encriptada, se chequea en el service).
- Una tarjeta `REVOKED` o con `deleted_at` no puede cobrarse: `TokenizedPaymentService::chargeWithCard()` valida defensa en profundidad.

### 4.2 `tokenized_card_transactions`

Audit trail **append-only** de todas las operaciones contra Firstoken. Una tabla transversal a cualquier operación del módulo.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | bigint PK | |
| `tokenized_card_id` | FK nullable | null para refund/void (no reciben card), smoke test, etc. |
| `user_id` | FK users | |
| `operation` | enum | 10 valores (ver §8.2) |
| `reference` | string(60) UNIQUE | Código idempotente del caller |
| `request_payload` | json | **Sanitizado** (PAN/CVV masked) |
| `response_payload` | json | Respuesta cruda de Firstoken |
| `status` | enum | `success` / `failure` |
| `error_message` | text nullable | En `failure` |
| `timestamps` | | |

La unicidad de `reference` es la barrera anti-duplicación del módulo: un Form Request con `unique:tokenized_card_transactions,reference` evita que un cobro con la misma referencia se ejecute dos veces.

---

## 5. Configuración

### 5.1 `config/firstoken.php`

```php
return [
    'api_key'           => env('FIRSTOKEN_API_KEY'),
    'base_url'          => env('FIRSTOKEN_BASE_URL'),      // Payments API + TaaS
    'inbound_url'       => env('FIRSTOKEN_INBOUND_URL'),   // Inbound Route (IP whitelist)
    'proxy_url'         => env('FIRSTOKEN_PROXY_URL'),     // Proxy genérico
    'transactions_url'  => env('FIRSTOKEN_TRANSACTIONS_URL'), // convertToPermanent
    'routes' => [
        'temporal' => env('FIRSTOKEN_ROUTE_TEMPORAL'),     // UUID del Inbound Route temporal
    ],
    'payment_scheme'    => env('FIRSTOKEN_PAYMENT_SCHEME', '7'),
    'timeout'           => (int) env('FIRSTOKEN_TIMEOUT', 30),
    'retry_attempts'    => (int) env('FIRSTOKEN_RETRY_ATTEMPTS', 2),
];
```

### 5.2 Variables `.env` requeridas

```
FIRSTOKEN_API_KEY=...
FIRSTOKEN_BASE_URL=https://api.firstoken-staging.co
FIRSTOKEN_INBOUND_URL=https://inbound-staging.firstoken.co
FIRSTOKEN_PROXY_URL=https://proxy-staging.firstoken.co
FIRSTOKEN_TRANSACTIONS_URL=https://api.firstoken-staging.co/transactions
FIRSTOKEN_ROUTE_TEMPORAL=<uuid-del-route-temporal>
FIRSTOKEN_PAYMENT_SCHEME=7
```

**Por qué cuatro URLs distintas:** Firstoken separa responsabilidades por hostname. Cada grupo usa autenticación distinta (ver §7).

---

## 6. Flujo completo de registro de tarjeta (6 pasos)

Es el flujo más sensible del módulo. Está encapsulado en `TokenizedCardService::register()` como orquestador de métodos privados `step*`.

```
┌──────────────────────────────────────────────────────────────────┐
│  POST /api/user/tokenized-cards                                  │
│  Body: { card_number, expiration_month, expiration_year, cvv,    │
│          holder_name }                                           │
└──────────────────────────────────────────────────────────────────┘
                                │
                                ▼
  step1  → TokenizedCard::create(status: 'PENDING')
           (row reservado para idempotencia + auditoría)
                                │
                                ▼
  step2  → FirstokenService::tokenizeTemporary(CardData)
           ── Inbound Route (IP whitelist, sin api_key) ──
           Recibe: UUID temporal con CVV asociado
                                │
                                ▼
  step3  → FirstokenService::authorize(
             PaymentRequest::forTemporalAuthorization(token, $0, ref, billTo)
           )
           ── Payments API (x-api-key) ──
           Verifica card contra banco emisor sin mover dinero
                                │
                                ▼
  step4  → FirstokenService::reverseAuthorization(transactionId, ref, ip, amount?)
           Libera el hold del paso 3 (Firstoken exige device_info.ip_address)
                                │
                                ▼
  step5  → FirstokenService::convertToPermanent(tempToken, tags, scheme='7')
           ── TaaS API ──
           Recibe: UUID permanente sin CVV (token reutilizable)
                                │
                                ▼
  step6  → TokenizedCard::update(status: 'ACTIVE', firstoken_token: permUuid)
           event(CardTokenized) + event(CardActivated)
                                │
                                ▼
  HTTP 201  — TokenizedCardResource
```

**Por qué 6 pasos y no 2:** la API de Firstoken exige este pipeline para dos motivos:
1. El token permanente **no se crea desde raw PAN** — sólo a partir de un token temporal ya existente. Conversión, no creación.
2. La verificación $0 auth + reverse garantiza que la tarjeta está viva antes de persistir el token en IguanaPay. Sin este paso, podrías tener tokens ACTIVE que rebotan en el primer cobro real.

Cada `step*` devuelve un tipo esperado (string, bool, PermanentTokenResult) y lanza una excepción tipada si falla. El service hace `try/catch` agrupado para degradar a `REVOKED` la tarjeta si el flujo rompe después del paso 2.

---

## 7. Comunicación con Firstoken — las 4 APIs

`FirstokenService` encapsula los 4 canales distintos. Cada uno tiene autenticación y host diferentes:

| API | Hostname | Auth | Uso |
|---|---|---|---|
| **Inbound Route** | `inbound_url` | IP whitelist (sin header) | `tokenizeTemporary()` — enviar PAN en crudo sobre TLS |
| **TaaS API** | `base_url` | `x-api-key: <key>` | `convertToPermanent()`, `inspectToken()`, `deleteToken()` |
| **Payments API** | `base_url` | `x-api-key: <key>` | `authorize()`, `capture()`, `reverseAuthorization()`, `refundPayment()`, `voidPayment()`, `getTransactionDetails()` |
| **Proxy** | `proxy_url` | Headers `ft-access-key`, `ft-url-destiny`, `ft-headers` | `sendViaProxy()` — para integraciones custom donde el procesador no habla el protocolo de Firstoken |

Internamente `FirstokenService` tiene 3 helpers privados que encapsulan retry y deserialización:

- `inboundRequest($payload)` → POST al Inbound Route
- `request($method, $url, $body)` → TaaS con `x-api-key`
- `paymentApiRequest($method, $url, $body)` → Payments con `x-api-key`, parsing de response distinto (el shape de Payments no envuelve en `chd`; devuelve flat snake_case con `status: "success"`).

Cada helper respeta `retry_attempts` (retry con `1000ms` fijo; Laravel 9 no acepta Closure en `$sleepMilliseconds`).

### Shape de respuesta distintos

Los 3 APIs devuelven shapes distintos:

```
Inbound Route:            Payments API:           TaaS (convert/inspect):
{                         {                       {
  "chd": {                   "status":"success",    "token_id": "...",
    "transaction": "...",    "transaction_info": {  "card_truncated":"...",
    "card_truncated":"...",    "transaction_id":.., "schema": "...",
    ...                         "status":.."Authorized"  "status":"active"
  }                          },                     }
}                            ...
                           }
```

Los DTOs normalizan estas diferencias. Un mismo flujo no debe ramificar basado en el shape — el DTO lo abstrae.

---

## 8. Capa de servicios

### 8.1 `TokenizedCardService`

Ciclo de vida de la tarjeta: `register()`, `findForUser()`, `delete()`, `list()`.

Métodos privados `step1`...`step6` que orquestan el flujo de §6. Helper privado `buildBillTo(User)` que extrae datos del usuario para Firstoken (fallback defensivo a valores genéricos si falta info).

Dispara eventos: `CardTokenized`, `CardActivated`.

### 8.2 `TokenizedPaymentService`

Operaciones de pago. Métodos:

| Método | Firstoken API | Operación loguera | Evento |
|---|---|---|---|
| `chargeWithCard()` | Payments.authorize | `PAYMENT` | `PaymentProcessed` |
| `chargeWithCvv()` | Payments.authorize (Camino C) | `PAYMENT` | `PaymentProcessed` |
| `captureAuthorization()` | Payments.capture | `PAYMENT_CAPTURE` | `PaymentCaptured` |
| `refund()` | Payments.refundPayment | `PAYMENT_REFUND` | — |
| `voidPayment()` | Payments.voidPayment | `PAYMENT_VOID` | — |
| `getTransactionStatus()` | Payments.getTransactionDetails | — (idempotente) | — |
| `verifyCard()` | (pendiente) | `VERIFY` | — |

**Camino C (`chargeWithCvv`)** es un patrón especial: usa expresión `{{ token : detokenize }}` para `number` y `expiration_date`, pero pasa el **CVV en crudo** del request. Firstoken lo reenvía al procesador sin persistirlo. El `PayloadSanitizer` enmascara el CVV antes de llegar a la BD.

### 8.3 `TokenizedCardLogger`

10 constantes de operación:

```
OP_TOKENIZE_PERMANENT    OP_TOKENIZE_TEMPORAL
OP_VERIFY                OP_VERIFY_REVERSAL
OP_PAYMENT               OP_PAYMENT_CAPTURE
OP_PAYMENT_REFUND        OP_PAYMENT_VOID
OP_INSPECT               OP_DELETE
```

Dos métodos públicos: `logSuccess()` y `logFailure()`. Ambos pasan `request_payload` por `PayloadSanitizer` antes de guardar. `response_payload` se guarda sin sanitizar (ya no trae PAN/CVV — solo IDs y metadata).

### 8.4 `PayloadSanitizer`

Enmascara keys sensibles con `***MASKED***` antes de loguear. Campos sanitizados:

```
card_number, cardnumber, number, pan
card_cvv, cvv, cvc, security_code, securitycode
card_truncated  ← también se enmascara por precaución
```

Recorre recursivamente arrays/objetos. Se aplica solo al `request_payload`, nunca modifica el payload real enviado a Firstoken.

---

## 9. Capa HTTP

### 9.1 Rutas

`routes/api/tokenized_cards.php`, bajo `auth:sanctum` y prefix `user`:

```
GET    /api/user/tokenized-cards
POST   /api/user/tokenized-cards
GET    /api/user/tokenized-cards/{id}
DELETE /api/user/tokenized-cards/{id}

POST   /api/user/tokenized-payments/charge
POST   /api/user/tokenized-payments/charge-cvv
POST   /api/user/tokenized-payments/capture
POST   /api/user/tokenized-payments/refund
POST   /api/user/tokenized-payments/void
GET    /api/user/tokenized-payments/status/{transactionId}
```

### 9.2 Controllers

**`TokenizedCardController`:** `index`, `store`, `show`, `destroy`. Instancia `TokenizedCardService`. Responde con `TokenizedCardResource`.

**`TokenizedPaymentController`:** `charge`, `chargeWithCvv`, `capture`, `refund`, `void`, `status`. Instancia `TokenizedCardService` + `TokenizedPaymentService`. Responde JSON plano con el `PaymentResult` aplanado.

**Patrón de endpoints que operan sobre una tarjeta existente:**
```php
$card = $this->cardService->findForUser($user, $request->input('tokenized_card_id'));
$this->authorize('pay', $card);   // TokenizedCardPolicy
```

**Patrón de endpoints que operan sobre una transacción:** refund, void, status no reciben card — identifican por `payment_transaction_id` / `authorization_transaction_id`. No aplican Policy porque no hay card. Si necesitás ownership check, hacé lookup en `tokenized_card_transactions` por transaction_id (costoso: JSON query). Actualmente asumen **operación admin o autoservicio del mismo user** (la tabla no está expuesta a terceros).

### 9.3 Form Requests

Todas validan `auth()->user()->status == 1` en `authorize()` — bloquea users bloqueados.

Reglas relevantes:
- `reference` siempre `unique:tokenized_card_transactions,reference` → idempotencia.
- `tokenized_card_id` siempre `exists:tokenized_cards,id`.
- `cvv` en CVV request: `digits_between:3,4`.
- `payment_type` en charge: `in:payment,authorization` (bundled vs. solo auth).
- `currency` `size:3` (ISO 4217).

### 9.4 Policies

`TokenizedCardPolicy` con abilities:
- `view` — el card pertenece al user.
- `pay` — el card pertenece al user **y** `status == 'ACTIVE'` **y** `deleted_at == null`.
- `delete` — el card pertenece al user.

Registrada en `AuthServiceProvider::$policies`.

### 9.5 Resource

`TokenizedCardResource` serializa **solo campos seguros**. El `firstoken_token` nunca sale del backend.

### 9.6 Middleware

`ForceJsonResponse` inyecta `Accept: application/json` en requests a `/api/*` para garantizar que `Handler::render()` devuelva JSON aunque el cliente no mande el header. Registrado en `Kernel::$middlewareGroups['api']`.

---

## 10. DTOs

Todos son **inmutables** (readonly properties o `__construct` con `private`). Factory methods estáticos nombrados.

### `CardData`
Raw input del user. Factory `fromArray()` + `toInboundPayload()`. Normaliza holder_name a uppercase.

### `PaymentRequest`
Factories:
- `forTemporalAuthorization()` — token temporal con CVV ya incluido.
- `forPermanentPayment()` — expresión `{{ token : detokenize }}`, opcional `$type = 'payment'` o `'authorization'`, `security_code` default `'000'` (placeholder — pendiente confirmar con GM Sectec si se puede omitir).

Método `toPayload()` construye el shape exacto que espera Payments API.

### `PaymentResult`
Factory `fromFirstokenResponse($body)`. Parsea `transaction_info.*` y devuelve objeto con:
```
$transactionId, $status, $responseCode, $approvalCode,
$authorizedAmount, $currency, $createdAt, $rawResponse
```

### `PermanentTokenResult`
Parsea respuesta de `convertToPermanent`. Campo `schema` del API se mapea a `scheme` internamente (el API usa schema, el dominio de IguanaPay usa scheme consistentemente).

### `TokenResult`
Temporal — del Inbound Route. `$token, $franchise, $lastFour, $rawResponse`.

### `ProxyRequest` / `ProxyResponse`
Para `sendViaProxy()`. Headers `ft-access-key`, `ft-url-destiny`, `ft-headers`.

---

## 11. Excepciones

**Jerarquía:**
```
FirstokenException (abstracta)
├── FirstokenAuthException           (401/403)
├── FirstokenConnectionException      (network)
├── TokenizationFailedException       (tokenize*)
├── PaymentAuthorizationFailedException
│   └── ::fromPaymentResult($result)  (factory desde PaymentResult no aprobado)
├── CardVerificationFailedException   ($0 auth rechaza)
├── CardNotActiveException            (defensive check en service)
├── CardNotFoundException             (lookup)
├── CardOwnershipException            (Policy)
└── PaymentProcessingException
    └── ::fromProcessorResponse($raw, $ref, $code)  (envelope para user)
```

Todas exponen `getFirstokenResponse()` (raw body) y `getResponseCode()` cuando aplica — útil para que el logger guarde el contexto y el handler decida status HTTP.

Renderables en `App\Exceptions\Handler`:
- `FirstokenException` → JSON con error envelope del proyecto: `{remark, status, message: {error: [...]}}`
- `ValidationException` → flat array (consistente con el resto del backend legacy).
- `ThrottleRequestsException` → 429 estandarizado.
- `AuthorizationException`, `NotFoundHttpException` → 403/404 en JSON.
- `unauthenticated()` simplificado — respuesta JSON coherente para `/api/*`.

---

## 12. Eventos

Arquitectura EDA (ver `ARCHITECTURE.md` §9 del proyecto). Los eventos usan `Dispatchable, SerializesModels`.

| Evento | Disparado por | Props |
|---|---|---|
| `CardTokenized` | `TokenizedCardService::register` step 2 | `TokenizedCard`, `User` |
| `CardActivated` | `TokenizedCardService::register` step 6 | `TokenizedCard`, `User` |
| `PaymentProcessed` | `TokenizedPaymentService::chargeWithCard/Cvv` | `TokenizedCard`, `User`, `PaymentResult` |
| `PaymentCaptured` | `TokenizedPaymentService::captureAuthorization` | `TokenizedCard`, `User`, `PaymentResult` |

Listeners se registran en `EventServiceProvider` — para notificaciones, emails, webhooks, etc. El service no bloquea esperando al listener (cuando estén en cola).

---

## 13. Seguridad y cumplimiento PCI-DSS

1. **Token opaco encriptado en reposo.** `TokenizedCard::firstoken_token` usa cast `encrypted` → AES-256-CBC con clave de `APP_KEY`. Si la BD se filtra sin `.env`, los tokens son inútiles.
2. **PAN/CVV nunca persisten.** El módulo solo tiene `card_number` en memoria durante el POST de registro. El Inbound Route los consume; IguanaPay no los guarda.
3. **Sanitización de logs.** `PayloadSanitizer` asegura que `request_payload` en `tokenized_card_transactions` nunca contenga PAN/CVV aunque el código suba el payload completo.
4. **IP whitelist del Inbound Route.** Segundo factor: aunque alguien tenga `api_key`, no puede tokenizar sin IP en lista blanca de Firstoken.
5. **TLS mandatorio.** `base_url` / `inbound_url` / `proxy_url` son HTTPS. `FirstokenService` no acepta HTTP.
6. **Idempotencia.** `reference` único por transacción previene doble cobro por reintento de red.
7. **Defense in depth en el service.** Aunque la Policy filtre tarjetas inactivas, `TokenizedPaymentService::chargeWithCard` re-valida `status === 'ACTIVE' && deleted_at === null` — por si se llama desde un job o command.
8. **Rate limiting** (ver §14) — declarado pero comentado; reactivar en prod.

---

## 14. Rate limiting

Definido en `RouteServiceProvider::configureRateLimiting()`:
- `tokenized-card-store` — 5/h por user (antirregistro abusivo).
- `tokenized-payment-charge` — 30/h por user (antifraude low-velocity).

**Estado actual:** rate limits **registrados pero comentados** en `routes/api/tokenized_cards.php`. Reactivar antes de producción.

---

## 15. Auditoría — tabla de transacciones

Toda operación Firstoken genera un row en `tokenized_card_transactions`. El diseño es **append-only**: nunca se updatean rows. El timeline de cualquier tarjeta se reconstruye ordenando por `created_at`.

**Consulta típica de debugging:**
```sql
SELECT operation, status, reference, error_message, created_at
FROM tokenized_card_transactions
WHERE tokenized_card_id = ?
ORDER BY created_at;
```

**Consulta para refund/void/status** (no tienen tokenized_card_id):
```sql
SELECT operation, status, reference, response_payload
FROM tokenized_card_transactions
WHERE user_id = ?
  AND operation IN ('PAYMENT_REFUND', 'PAYMENT_VOID')
ORDER BY created_at;
```

---

## 16. Smoke test — `firstoken:smoke-test`

Comando artisan que valida conectividad contra Firstoken sandbox. **7 pasos**:

```
[1/7] Tokenización temporal via Inbound Route
      → UUID temporal + franchise + últimos 4
[2/7] Authorize de verificación (Payments API)
      → 100 COP (sandbox no acepta $0 confiable) + reverse en paso 3
      → transaction_id + status + response_code
[3/7] Reverse authorization
      → libera hold (incluye device_info.ip_address obligatorio)
[4/7] Convert temporal → permanente
      → UUID permanente + card_truncated + scheme
[5/7] Inspect permanente
      → metadata
[6/7] Delete permanente
      → confirmación
[7/7] Verify deletion via inspect
      → confirmar que retorna null
```

Constantes centralizadas (`VERIFICATION_AMOUNT`, `VERIFICATION_CURRENCY`, `TEST_IP`) — cualquier cambio del monto de prueba o la IP placeholder se hace en un solo lugar.

**Propiedades del smoke test:**
- **Degradación elegante.** Los pasos 2, 3, 5, 7 son `warning` si fallan (no cortan el flujo). Solo 1 y 4 hacen `exit 1`.
- **Usuario placeholder.** Toma `User::query()->value('id')` para el FK del logger. Si no hay users, el logger se salta (no corta).
- **Referencias únicas.** Cada paso genera su propio `reference` con `now()->timestamp` → corridas consecutivas no colisionan.
- **Side effects controlados.** El paso 6 elimina el token permanente del sandbox → el smoke no ensucia la base Firstoken con tokens huérfanos.

Ejecución:
```bash
php artisan firstoken:smoke-test
```

---

## 17. Manejo de errores — envelope del proyecto

El proyecto tiene un shape de error legacy que se respeta para no romper Flutter. Formato:

```json
{
  "remark": "validation_error | not_found | unauthorized | processing_error | ...",
  "status": "error",
  "message": { "error": ["Please select a wallet", "Amount must be greater than 0"] }
}
```

Todas las excepciones del módulo se traducen a este shape por `Handler::render()`. **No** se devuelve `errors: {field: [...]}` estilo Laravel default — el Flutter existente no lo espera.

---

## 18. Decisiones y consideraciones técnicas

### 18.1 Por qué no se usa un Inbound Route para permanente directo
Firstoken sí ofrece un Inbound Route permanente, pero el flujo `convertToPermanent` tiene dos ventajas:

1. Permite verificación $0 entre paso 2 y paso 5 — si la tarjeta no aprueba, no se crea token permanente.
2. Deja trazabilidad separada temporal / permanente en `tokenized_card_transactions` (operations `TOKENIZE_TEMPORAL` vs `TOKENIZE_PERMANENT`).

**Trade-off:** más roundtrips (2 tokens + 1 auth + 1 reverse en vez de 1 tokenize). Lo aceptamos por seguridad.

### 18.2 Por qué `security_code = '000'` por defecto en `forPermanentPayment`
Firstoken requiere el campo presente. Un token permanente no tiene CVV asociado. El `'000'` es placeholder — el procesador acepta o rechaza según política de MID. **Pendiente confirmar con GM Sectec** si el campo se puede omitir completamente. Si sí, actualizar el DTO para que sea nullable.

### 18.3 Por qué `chargeWithCvv` (Camino C) no usa factory
El DTO `PaymentRequest` tiene `forPermanentPayment` (todo token) y `forTemporalAuthorization` (todo token + CVV incluido en el propio token). Camino C es híbrido: número/exp son expresiones, pero CVV viene del request del momento. No justifica otro factory por un caso único — se usa el constructor directo con comentario explicativo.

### 18.4 Por qué las operaciones post-pago (refund/void/status) no reciben card
El identificador canónico es el `transaction_id` devuelto por Firstoken. Obligar a pasar la card agrega acoplamiento innecesario — una operación de refund puede existir sin acceso al modelo de card (ej: reconciliación batch). El `tokenized_card_id` queda `null` en el logger para estas ops.

**Trade-off:** Policy `pay` no puede aplicarse. Implicancia: si se exponen estos endpoints al user final con riesgo de abuso, agregar ownership check via lookup en `tokenized_card_transactions.payment_transaction_id`. Actualmente se asume uso interno / admin.

### 18.5 Por qué `capture` sí recibe card
`PaymentCaptured` es un evento que incluye la card (para listeners que emiten notificación al user con los últimos 4 de la tarjeta capturada). El service requiere la card para dispatchar. El form request incluye `tokenized_card_id` como excepción al patrón §18.4.

### 18.6 `captureAuthorization` vs `chargeWithCard(paymentType='authorization')`
Dos endpoints relacionados:
- `chargeWithCard(paymentType='authorization')` reserva fondos (hold) sin capturar. Devuelve un `transaction_id`.
- `captureAuthorization(transactionId)` mueve efectivamente el dinero.

Patrón útil para: reservar al agregar al carrito, capturar al confirmar. Si el user cancela antes de capturar → `voidPayment(transactionId)` libera el hold.

### 18.7 `void` vs `refund`
- `void` funciona solo si la transacción **no se procesó** aún (pending en el procesador). Si ya se liquidó, Firstoken responde con error.
- `refund` funciona **después** de la liquidación. Mueve dinero de vuelta al tarjetahabiente.

Ambos son endpoints separados porque Firstoken los expone como operaciones distintas. El cliente debe elegir según el estado del pago (consulta previa con `getTransactionStatus` si tiene dudas).

### 18.8 Soft delete de `TokenizedCard`
Al hacer `DELETE /api/user/tokenized-cards/{id}`:
1. Se llama `FirstokenService::deleteToken($card->firstoken_token)` → hard delete en Firstoken.
2. Se hace `$card->delete()` → soft delete local (row conservado para auditoría).

**Invariante:** una card con `deleted_at != null` nunca debe poder cobrarse. Garantizado en la Policy + defensive check en el service.

### 18.9 Laravel 9 compatibilities
- `retry()` con `$sleepMilliseconds` **debe ser int**, no Closure (Closures son Laravel 10+).
- `casts()` method en modelos **no existe** en Laravel 9 — usar `protected $casts = [...]` array.

### 18.10 `reverseAuthorization` — IP obligatorio

Firstoken exige `device_info.ip_address` en el body de la reversal. El método tiene firma `(transactionId, referenceCode, ipAddress, ?amount)`. Callsites:

- **Controller / FormRequest path** (futuro): tomar `request()->ip()` directo.
- **`TokenizedCardService::stepReverseAuthorization`**: usa `request()?->ip() ?? '0.0.0.0'` (corre dentro de un request HTTP, fallback defensivo si se invoca desde job/command).
- **Smoke test**: usa la constante `TEST_IP = '0.0.0.0'`.

El monto es opcional (`?float`); si se omite Firstoken asume el monto original de la auth.

---

## 19. Extensiones futuras (no implementadas)

- `verifyCard()` standalone — actualmente stub `RuntimeException`.
- `PaymentRefunded` / `PaymentVoided` events — simétricos a Processed/Captured.
- Ownership check en refund/void/status si se exponen al user final.
- Reactivación de rate limits en rutas productivas.
- Jobs en cola para listeners de eventos (actualmente sync).
- Métricas / observability — contador de fallos por operation, latencia por API Firstoken.

---

## 20. Referencias cruzadas del proyecto

- `README.MD` — instalación y overview general.
- `ARCHITECTURE.md` — arquitectura del proyecto (EDA, módulo de préstamos).
- `core/INFORME_CAMBIOS_API_FLUTTER.md` — breaking changes para equipo Flutter.
- `TARJETA_DE_CREDITO_ESTADO_ACTUAL.md` — estado del módulo según rama legacy.
