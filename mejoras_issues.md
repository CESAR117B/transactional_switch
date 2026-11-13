# Mejoras implementadas — revisión de código

Documento de cierre de la revisión hecha en la carpeta `Issues/`. Cada punto conserva el orden y el identificador del review original y explica **qué pedía** y **qué se hizo** en el código.

## Resumen

| Review | Puntos | Resueltos | Pendientes |
|---|---:|:-:|:-:|
| Seguridad (`Issues/seguridad.md`) | 3 | 3 | 0 |
| Arquitectura (`Issues/idempotencia_consistencia.md`) | 11 | 11 | 0 |
| Convenciones (`Issues/Convenciones.md`) | 2 | 2 | 0 |
| Calidad (`Issues/console.log.md`) | 3 | 3 | 0 |
| **Total** | **19** | **19** | **0** |

Los 19 puntos del review están cerrados en el código y en el repositorio. El historial Git fue purgado y `origin/main` reescrito. Queda una única acción operativa externa: **rotar los secretos** (`JWT_SECRET`, `MICROSERVICE_SECRET` y credenciales de BD), porque sus valores estuvieron publicados antes de la purga.

---

# 1. Seguridad

## 1.1. Microservicio TCP accesible sin autenticación — resuelto

**Qué pedía:** dejar de publicar el puerto `3001` y autenticar al llamador, porque cualquiera con acceso de red podía listar transacciones de todas las apps o rotar la key del admin.

**Qué se hizo:**
- `microservicio_server/docker-compose.yml`: el servicio quedó sólo en la red interna con `expose: "3001"`; se eliminó `ports`.
- Nuevo `microservicio/src/common/rpc-auth.pipe.ts`: el gateway envía un sobre `{ __rpcAuth, payload }` y el microservicio valida un **secreto compartido** (`MICROSERVICE_SECRET`) con `timingSafeEqual`. Sin secreto configurado, falla cerrado (401/500) y no atiende llamadas.
- Registrado globalmente en `main.ts` antes del `ValidationPipe`, de modo que los handlers siguen recibiendo el payload original.

**Archivos:** `rpc-auth.pipe.ts`, `rpc-auth.pipe.spec.ts`, `main.ts`, `docker-compose.yml`, `client-app/src/microservice-rpc.service.ts`.

## 1.2. Token de tarjeta en claro en la tabla de auditoría — resuelto

**Qué pedía:** enmascarar el token de Firstoken antes de emitir el evento de auditoría, tanto en el flujo permanente como en el temporal.

**Qué se hizo:**
- `firstoken.service.ts`: nuevo `respuestaAuditable(data)` que clona la respuesta y reemplaza `custom_field_details.card.token` por `[REDACTED]` antes de persistir/auditar. Se aplica en ambos flujos.
- `auditoria.service.ts`: `sanitizePayload` elimina `card_cvv` y enmascara `card_number` antes de guardar el `requestPayload`.
- Spec `firstoken-auditoria.spec.ts` verifica que el token quede redactado y que el objeto original no se mute.

**Archivos:** `firstoken.service.ts`, `auditoria.service.ts`, `firstoken-auditoria.spec.ts`.

## 1.3. Secretos versionados y copiados a la imagen — resuelto (falta rotación externa)

**Qué pedía:** rotar `JWT_SECRET` y credenciales de BD, sacar `.env` del repo y del build, agregar `.env` a `.gitignore`/`.dockerignore` y usar build multi-stage con `NODE_ENV=production`. El review también proponía versionar `.env.example`; esa parte **se descartó a propósito**: las variables se comparten por un canal externo y las plantillas se eliminaron del repositorio.

**Qué se hizo:**
- `.env` **no está trackeado** ni existe en el árbol actual: no aparece en `git ls-files`, `HEAD` ni `origin/main`.
- `.env` está en `.gitignore` y en `.dockerignore` de ambos proyectos; los archivos locales siguen en disco pero quedan ignorados.
- **Historial purgado por completo** con `git filter-branch --index-filter` sobre `--all`, eliminando las cuatro rutas de todos los commits:
  - `client-app/.env`
  - `client-app/.env.example`
  - `microservicio/.env`
  - `microservicio/.env.example`
- Refuerzos posteriores: `git reflog expire --expire=now --all` y `git gc --prune=now --aggressive` para borrar los objetos antiguos; `main` publicado con `git push --force origin main`.
- `client-app/.env.example` y `microservicio/.env.example` se **borraron intencionalmente** del disco y del historial. No se vuelven a versionar.
- Los `Dockerfile` y el `docker-compose.yml` usan `NODE_ENV=production` y los secretos se inyectan por `env_file` en runtime.

**Verificación ejecutada:**

| Comprobación | Resultado |
|---|---|
| `git log --all -- <rutas .env*>` | vacío |
| `git rev-list --all --objects \| greps .env` | sin coincidencias |
| `git ls-tree -r --name-only origin/main \| greps .env` | sin coincidencias |
| `main` vs `origin/main` | sincronizados en el commit reescrito |

**Acción externa pendiente (no bloquea el código):** rotar `JWT_SECRET`, `MICROSERVICE_SECRET` y las credenciales de base de datos antes de desplegar. El historial ya no expone los valores, pero los que estuvieron publicados deben considerarse comprometidos.

---

# 2. Arquitectura: idempotencia, consistencia y DI

## 2.1. Idempotencia real en pagos, transferencias y tokenización — resuelto

**Qué pedía:** reemplazar la deduplicación por contenido por `Idempotency-Key` + restricción única + no reenviar un resultado incierto.

**Qué se hizo:**
- El cliente genera un UUID por operación y lo envía en `Idempotency-Key`; el gateway lo propaga y el microservicio lo valida (`400` si falta o supera 100 caracteres).
- Nuevo campo `idempotency_key` y unique `(id_app, idempotency_key)` en `transacciones_servicios` y `tokenized_cards`.
- La fila se crea **antes** de llamar al banco. Si salta `P2002`, se resuelve como reintento:
  - ya procesado → devuelve la respuesta guardada;
  - pendiente reciente → `409` “en curso”;
  - resultado incierto (`PENDIENTE` viejo o `ERROR`) → reconcilia con `consultaOrdenes` por referencia, **sin reenviar** la carga.
- Se eliminó el reciclado por `requestHash` y el `deleteMany` fuera de transacción. `request_hash` queda sólo como huella de auditoría.
- Se agregó el límite anti-duplicado de 5 minutos (monto + cuenta beneficiario por app) como defensa adicional; responde `409`, no `429`.

**Archivos:** `tramas-produbanco.service.ts`, `produbanco/lotes.repository.ts`, `firstoken.service.ts`, DTOs de pago/transferencia/tokenización, `schema.prisma`.

## 2.2. Sincronización con estado de otro lote — resuelto

**Qué pedía:** no consultar al banco sin `envioId` válido ni referencia, y validar que la orden devuelta corresponda al lote.

**Qué se hizo:**
- Si no hay `Envio_Id` usable ni referencia descifrable, **no se consulta** y se reporta sólo el estado local (`banco.motivo`).
- Si se consulta por referencia (`idBuzon=0`), se compara `sobre.Referencia` con la referencia del lote; si no coincide, **no se sincroniza** y se registra un warning.

**Archivos:** `produbanco/consulta-transacciones.service.ts` (`consultarBanco`).

## 2.3. Cron sin lock y SOAP sin timeout — resuelto

**Qué pedía:** evitar ejecuciones solapadas y agregar timeout por llamada SOAP.

**Qué se hizo:**
- Candado en proceso (`ejecutando`) con liberación en `finally`.
- **Lock multi-instancia** con `pg_try_advisory_lock`/`pg_advisory_unlock` en un `pg.Client` dedicado (no el pool de Prisma), para garantizar la misma sesión. Si otra réplica tiene el lock, la corrida se omite y se registra.
- Timeout de 20 s por invocación SOAP (`conTimeout`), además del timeout de descarga del WSDL.

**Archivos:** `common/cron-lock.service.ts`, `cron-lock.service.spec.ts`, `transacciones-produbanco.job.ts`, `produbanco-soap.service.ts`.

## 2.4. La regla `logs` ignoraba `src/logs/` — resuelto

**Qué pedía:** anclar la regla a la raíz y versionar el código de logs, porque un clon limpio no compilaba.

**Qué se hizo:** `.gitignore` usa `/logs/`; se agregaron `src/logs/cron-log.service.ts`, `log-proceso.decorator.ts` y `log.module.ts` al repositorio.

## 2.5. Errores de negocio del microservicio llegaban como 500 — resuelto

**Qué pedía:** mapear `statusCode`/`status` a HTTP en el gateway y no filtrar detalles internos.

**Qué se hizo:**
- `MicroserviceExceptionFilter` traduce errores planos con `statusCode`/`status` 4xx al mismo status HTTP.
- Los 5xx y errores desconocidos responden un mensaje genérico con `correlationId`; el detalle (IPs, WSDL, HTML de proveedores) queda sólo en el log.
- `mensajeSeguro` acota longitud y descarta mensajes con URLs, IPs, `wsdl`, `ECONN`, stack, etc.
- Spec nuevo `microservice-exception.filter.spec.ts`.

**Archivos:** `client-app/src/microservice-exception.filter.ts`, su spec.

## 2.6. `asignarServiciosApp` borraba antes de validar — resuelto

**Qué pedía:** validar primero y ejecutar el borrado/creación dentro de una transacción.

**Qué se hizo:**
- Se normalizan los códigos (`trim().toUpperCase()`) antes de validar, lo que corrige el falso inválido de `catalogo_srv`.
- Se valida que todos los códigos existan y estén activos **antes** de tocar asignaciones.
- `deleteMany` + `createMany` corren dentro de `prisma.$transaction`; un código inválido deja intactas las asignaciones previas.
- Se impide asignar códigos que empiecen por `ADMIN`.

**Archivos:** `microservicio/src/admin/apps.service.ts`.

## 2.7. Auditoría admin registraba como actor a la app afectada — resuelto

**Qué pedía:** propagar `idAppAdmin` y usarlo como actor, dejando la app afectada en `entidadId`.

**Qué se hizo:** se envía `idAppAdmin` en los payloads de crear, actualizar, asignar, desasignar, cambiar estado, bloquear y rotar keys. La auditoría registra `idApp = idAppAdmin` y `entidadId = app afectada`. Se eliminó el `idApp: 0` en `activarDesactivarServicio`.

**Archivos:** `apps.service.ts`, `apps.controller.ts`, `client-app/src/app.service.ts`.

## 2.8. Rotar `encryptionKey` dejaba ilegible el historial — resuelto

**Qué pedía:** re-cifrar dentro de una transacción o versionar la llave.

**Qué se hizo:**
- La rotación corre en una `$transaction` que re-cifra tokens de tarjeta, `reference`, `requestPayload` y los campos sensibles de los detalles (identificación, cuenta, SWIFT), y recalcula los HMAC de búsqueda con la llave nueva.
- Si algún registro no se puede descifrar, la transacción aborta y la llave anterior queda vigente.
- Se corrigió el mensaje que decía que la llave no podía recuperarse.

**Archivos:** `apps.service.ts` (`nuevoencryptionKeyAppInterno`).

## 2.9. Validación de entrada de los lotes — resuelto

**Qué pedía:** normalizar los campos de la trama y acotar tamaño y monto.

**Qué se hizo:**
- `escapeXml` ahora reemplaza `\t`, `\r` y `\n` por espacios antes de escapar XML, impidiendo inyección de columnas o saltos en la trama.
- DTOs (gateway y microservicio): `@ArrayMinSize(1)` y `@ArrayMaxSize(100)` en `detalles`, `@IsPositive` y `@Max(99_999_999.99)` en `monto`, y `@MaxLength` en referencias, comprobantes, email, etc.
- Validaciones de trama: cuenta y tipo de cuenta obligatorios para `CTA`/`SPI`, y cantidad de dígitos de identificación según `tipoId` (`C`=10, `R`=13).

**Archivos:** `produbanco/trama-builder.service.ts`, `produbanco.utils.ts`, DTOs de pago/transferencia.

## 2.10. Boilerplate repetido en controladores — resuelto

**Qué pedía:** un exception filter global en el microservicio y un param decorator en el gateway.

**Qué se hizo:**
- `RpcExceptionFilter` global extiende `BaseRpcExceptionFilter` y normaliza toda excepción (incluidas `HttpException` y `Error` sueltos) a `{ statusCode, message, error }`. Se quitaron los `try/catch` repetidos de los controladores.
- Se unificó `status` → `statusCode` en `auth.service.ts` y `firstoken.service.ts`; se quitó `InternalServerErrorException`.
- `@AppAuth()` inyecta `request.appAuth` con `id_app` garantizado y reemplaza el boilerplate `@Req() req` + chequeo en los controladores admin, de servicios y de tarjetas. Se eliminaron las interfaces `ReqConAppAuth` duplicadas.
- Specs: `rpc-exception.filter.spec.ts`, `app-auth.decorator.spec.ts`.

**Archivos:** `common/rpc-exception.filter.ts`, `client-app/src/app-auth.decorator.ts`, controladores.

## 2.11. Servicio Produbanco de 2.177 líneas con bloques copiados — resuelto

**Qué pedía:** separar en providers pequeños e inyectables y compartir el mapeo de detalles.

**Qué se hizo:** `tramas-produbanco.service.ts` quedó como orquestador (~300 líneas) y se creó `src/produbanco/`:

| Provider | Responsabilidad |
|---|---|
| `trama-builder.service.ts` | Armado de XML de pago/transferencia y validaciones de lote |
| `lotes.repository.ts` | Persistencia cifrada, idempotencia, referencias, búsquedas y anti-duplicado |
| `consulta-transacciones.service.ts` | Listados app/admin, consulta al banco y sincronización |
| `detalle.mapper.ts` | `mapearDetalle` único + normalizadores y cifrado de payload |
| `produbanco.types.ts` / `produbanco.utils.ts` | Tipos y helpers puros compartidos |

El servicio principal conserva su API pública y re-exporta `EstadoTransaccion`/`EstadoBanco`. El mapeo de detalles dejó de estar replicado en cuatro lugares.

---

# 3. Convenciones

## 3.1. Nombres de archivos, métodos y clases fuera de convención — resuelto

**Qué pedía:** pasar métodos a camelCase y archivos a kebab-case con sufijo, además de eliminar restos del starter (`MATH_SERVICE`, `math-service`).

**Qué se hizo:**
- `git mv` de archivos y carpetas: `TramasProdubanco.service.ts` → `tramas-produbanco.service.ts`, `TransaccionesProdubanco.job.service.ts` → `transacciones-produbanco.job.ts`, `FirstokenService.service.ts` → `firstoken.service.ts`, `carsave.service.ts` → `card-save.service.ts`, `servicios.modules.ts` → `servicios.module.ts`, `servicios.ts` → `servicios.service.ts`, carpeta `Integraciones/` → `integraciones/`.
- Clases renombradas (`FirsTokenService` → `FirstokenService`, `Servicios` → `ServiciosService`) y métodos a camelCase.
- Token/paquete del starter reemplazados por `SWITCH_SERVICE` / `transactional-switch`.
- Imports actualizados en todo el proyecto; los specs siguen compilando.

## 3.2. `any` en requests, payloads y retornos — resuelto

**Qué pedía:** reemplazar `any` por DTOs/interfaces, sobre todo donde viajan datos de tarjeta y payloads de auditoría.

**Qué se hizo:**
- `save-cards.controller.ts`, `servicios.controller.ts` y `tramas-produbanco.controller.ts` usan DTOs tipados y `@AppAuth()` en lugar de `req: any`.
- `TokenizacionResult` y tipos de respuesta tipados en `firstoken.service.ts`.
- `transaction-log.event.ts` y `auditoria.service.ts` tipan `requestPayload`/`responsePayload` con `unknown`/`Prisma.InputJsonValue`.
- Verificación: no quedan ocurrencias de `any` en los archivos señalados por el review.

---

# 4. Calidad

## 4.1. `console.log`, comentarios obsoletos y código muerto — resuelto

**Qué pedía:** usar `Logger`, corregir mensajes que contradecían al código y borrar código sin uso.

**Qué se hizo:**
- `console.log` reemplazados por `Logger.debug/log` (auditoría, bootstrap, etc.).
- `main.ts` ya no imprime “Math Service is running on port 3001” con puerto fijo; usa `new Logger('Bootstrap')` con `host`/`port` reales.
- Se corrigieron mensajes falsos: “la app admin debe re-autenticarse”, “los JWT ya emitidos siguen vigentes”, “nunca se regenera una llave”.
- Se eliminaron comentarios de andamiaje y el `include: { app_servicios: true }` sin uso.
- El duplicado de negocio pasó de `429` a `409`, consistente con el resto.

## 4.2. Validaciones de DTO que no se ejecutaban o invertían el valor — resuelto

**Qué pedía:** que `@ValidateNested()` se ejecute y que `"false"` no se convierta en `true` con `enableImplicitConversion`.

**Qué se hizo:**
- `@ValidateNested()` + `@Type(() => UpdateAppDto)` en el payload de actualización, tanto en gateway como en microservicio; `data` dejó de ser `any`.
- `@Transform` explícito para `temporal` (`TokenizeCardDto`) y `activo` (`crear-app`, `cambiar-estado-servicio-app`): sólo `'true'`/`'false'` se convierten a booleano.
- Se agregaron `@MaxLength`, `@Matches` y normalizaciones para identificadores y códigos.

## 4.3. Cobertura mínima de tests — resuelto

**Qué pedía:** tests para `ApiKeyGuard`, `AuthService.verificarKey`, `UniversalCryptoService`, `hashBusqueda` y armado de tramas.

**Qué se hizo:** se pasó de 1 spec a **14 suites**:

| Área | Specs |
|---|---|
| Gateway | `api-key.guard`, `microservice-rpc.service`, `microservice-exception.filter`, `app-auth.decorator` |
| Seguridad RPC | `rpc-auth.pipe`, `rpc-exception.filter` |
| Criptografía/búsqueda | `universal-crypto.service`, `hash-busqueda` |
| Produbanco | `tramas-produbanco-xml`, `tramas-produbanco-idempotencia`, `detalle.mapper`, `cron-lock.service` |
| Auth/auditoría | `auth.service`, `firstoken-auditoria` |

Casos cubiertos relevantes: cifrar/descifrar y fallo con authTag alterado, hash determinista, inyección de tabuladores/saltos en la trama, reintento idempotente sin reenvío, lock del cron, mapeo de errores 4xx/5xx y enmascarado del token.

---

# Verificación final

| Proyecto | Typecheck | Tests | Build |
|---|---|---|---|
| `microservicio` | OK | 10 suites / 55 tests | OK |
| `client-app` | OK | 4 suites / 26 tests | OK |

# Pendiente y riesgos residuales

1. **Seguridad #3:** código e historial ya están limpios (`.env*` eliminado de todos los commits y `origin/main` reescrito). Falta únicamente la **rotación de secretos** (`JWT_SECRET`, `MICROSERVICE_SECRET`, credenciales de BD) como acción operativa externa. Nota: `git filter-repo` no está instalado y no hay Python en este entorno; la purga se hizo con `git filter-branch` nativo, que produce el mismo resultado.
2. La carpeta `prisma/migrations` no existe: los cambios de esquema se aplican con `prisma db push`. Para producción conviene generar migraciones versionadas.
3. El límite anti-duplicado de 5 minutos es *best-effort*; dos peticiones exactamente simultáneas con claves de idempotencia distintas podrían pasar ambas. La garantía estricta sigue siendo `Idempotency-Key`. Las variables de entorno se comparten por un canal externo; el repo ya no incluye `.env` ni `.env.example`.
