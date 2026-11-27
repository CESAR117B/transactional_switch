# Guía de Despliegue con Docker y Docker Compose

Esta documentación detalla los pasos para desplegar la arquitectura completa del sistema, la cual se compone de cuatro servicios distribuidos en contenedores Docker:

1. **PostgreSQL 18**: Base de datos relacional.
2. **pgAdmin 4**: Interfaz web para administrar PostgreSQL.
3. **Microservicio NestJS**: Servicio encargado de la lógica transaccional.
4. **Client App NestJS**: Aplicación principal / API Gateway.

---

## 1. Estructura del Proyecto

Asegúrate de que la estructura de carpetas en tu equipo sea la siguiente:

```text
/ (Raíz del proyecto)
├── client-app/
│   ├── Dockerfile
│   └── ...
├── microservicio/
│   ├── Dockerfile
│   └── ...
├── postgreSql/
│   ├── back-up/
│   │   ├── init-switch.sh
│   │   └── switch_transaccional.dump
│   └── docker-compose.yml
└── microservicio_server/
    └── docker-compose.yml
```

---

## 2. Requisitos Previos

- **Docker Desktop** instalado y en ejecución.

La red compartida `postgres_network` **la crea automáticamente** el compose de `postgreSql` (está declarada con `name: postgres_network`). Por eso el orden de arranque importa: primero `postgreSql` y después `microservicio_server`, que la consume como `external: true`.

Si preferís crearla a mano antes de levantar nada, también funciona:

```bash
docker network create postgres_network
```

---

## 3. Despliegue de los Servicios

El despliegue se realiza en dos fases: primero la base de datos y su administrador, y posteriormente las aplicaciones NestJS.

### Fase 1: Desplegar PostgreSQL y pgAdmin

1. Navega a la carpeta de PostgreSQL:
   ```bash
   cd postgreSql
   ```

2. Reconstruye las imágenes e inicia los contenedores(util si se realiza un cambio en el Dockerfile o en el código fuente):
   ```bash
    docker compose up -d --force-recreate  
   ```

3. **Verificación:**
   - **Base de datos:** Se habrá creado la base de datos `test` y se habrá ejecutado el script `init-switch.sh` para restaurar automáticamente el respaldo `.dump` en la base de datos `switch`.
   - **pgAdmin:** Accede a [http://localhost:5050](http://localhost:5050).
     - **Email:** `root@admin.com`
     - **Contraseña:** `admin`

### Conexión a PostgreSQL: puertos y redes

El contenedor `postgres_18` escucha en el puerto **`5432`** dentro de la red Docker. El `docker-compose.yml` publica ese puerto hacia el host como **`55432`**:

```yaml
ports:
  - "55432:5432"
    # host : contenedor
```

Por eso el host y el puerto cambian según desde dónde te conectes:

| Desde | Host | Puerto | Base de datos |
|---|---|---|---|
| DBeaver, microservicio u otra app en Windows | `localhost` | `55432` | `switch` |
| pgAdmin (contenedor) | `postgres` | `5432` | `switch` |
| Otro contenedor de la red `postgres_network` | `postgres` | `5432` | `switch` |
| Contenedor externo que sale al host | `host.docker.internal` | `55432` | `switch` |

Credenciales del compose:

- **Usuario:** `root`
- **Contraseña:** `1234`
- **Base de datos:** `switch` (creada y restaurada por `init-switch.sh`)

> **Importante:** `55432` sólo existe en el host. Dentro de Docker no hay nada escuchando en ese puerto; los contenedores usan siempre `postgres:5432`. Por eso, al registrar el servidor en pgAdmin (que corre en un contenedor) hay que usar:
>
> - **Host:** `postgres`
> - **Port:** `5432`
> - **Maintenance database:** `postgres` (o `switch`)
> - **Username:** `root`
> - **Password:** `1234`

Las IPs internas (`172.18.0.x`) las asigna Docker automáticamente al crear la red bridge `postgres_network` y **pueden cambiar** si se recrean los contenedores. Por eso conviene usar el nombre del servicio (`postgres`) en lugar de una IP fija.

Verificación rápida de la red y el mapeo de puertos:

```bash
docker network inspect postgres_network
docker port postgres_18
```

> **Red compartida con los microservicios:** este compose crea la red `postgres_network` (nombre fijo declarado con `name:`), y `microservicio_server/docker-compose.yml` la declara como `external: true`. Ambos composes deben usar exactamente el **mismo** nombre para que los contenedores NestJS resuelvan `postgres` por DNS interno:
>
> ```yaml
> networks:
>   postgres_network:
>     name: postgres_network
>     driver: bridge
> ```
>
> Si el nombre no coincide, `docker compose up` falla con `network <nombre> not found` (al declararla externa) o los microservicios no resuelven `postgres`. El orden de arranque es: primero `postgreSql` (crea la red) y después `microservicio_server`.
>
> ```bash
> cd postgreSql && docker compose up -d
> cd ../microservicio_server && docker compose up -d
> ```

---

### Fase 2: Desplegar el Microservicio y la Aplicación Cliente

1. Navega a la carpeta de servidores NestJS:
   ```bash
   cd ../microservicio_server
   ```

2. Construye las imágenes e inicia los contenedores:
   ```bash
   docker compose up -d --build
   ```

3. **Verificación:**
   - **Microservicio:** escucha en `3001` **sólo dentro de la red Docker** (no se publica en el host). El gateway lo alcanza como `microservicio:3001`.
   - **Client App (API Gateway):** Disponible en [http://localhost:3000](http://localhost:3000).
   - **Healthcheck:** [http://localhost:3000/health](http://localhost:3000/health) debe responder `{"status":"ok","microservicio":"conectado"}`.

### Documentación Swagger en Docker

La imagen se ejecuta con `NODE_ENV=production`, y en producción el gateway no publica su documentación. Para este entorno de pruebas se habilita de forma explícita con la variable `ENABLE_SWAGGER`, que el compose deja activa por defecto:

```yaml
environment:
  NODE_ENV: production
  ENABLE_SWAGGER: "${ENABLE_SWAGGER:-true}"
```

Rutas disponibles:

| Ruta | Contenido |
|---|---|
| `http://localhost:3000/doc` | Interfaz web de Swagger UI |
| `http://localhost:3000/doc-json` | Especificación OpenAPI en JSON |

Para deshabilitarla sin editar archivos (simular producción estricta):

```bash
cd microservicio_server
ENABLE_SWAGGER=false docker compose up -d client-app
```

En PowerShell:

```powershell
$env:ENABLE_SWAGGER = "false"
docker compose up -d client-app
Remove-Item Env:ENABLE_SWAGGER
```

> Si `/doc` devuelve `{"message":"Cannot GET /doc", ...}`, revisá que la variable esté en `true` dentro del contenedor:
>
> ```bash
> docker exec nest_client_app printenv ENABLE_SWAGGER
> ```
>
> Un cambio en esta variable sólo requiere recrear el contenedor (`docker compose up -d client-app`); no hace falta reconstruir la imagen.

---

## 4. Gestión y Mantenimiento de Contenedores

### Ver el estado de los contenedores
```bash
docker ps
```

### Ver los logs en tiempo real
- **Logs de NestJS:**
  ```bash
  cd microservicio_server
  docker compose logs -f
  ```
- **Logs de PostgreSQL/pgAdmin:**
  ```bash
  cd postgreSql
  docker compose logs -f
  ```

### Reconstruir contenedores tras cambios en el código
Si modificas el código de NestJS o cambias la versión de Node en los `Dockerfile`:
```bash
cd microservicio_server
docker compose build --no-cache
docker compose up -d
```

### Detener los servicios
- **Detener conservando los datos:**
  ```bash
  docker compose down
  ```
- **Detener y eliminar volúmenes (Reinicia la base de datos desde cero):**
  ```bash
  docker compose down -v
  ```

---

## 5. Solución de Problemas Comunes

### Build del microservicio: `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`

Si al construir las imágenes aparece:

```text
Error: ERR_PNPM_LOCKFILE_CONFIG_MISMATCH
  × installing dependencies
  ╰─▶ Cannot proceed with the frozen installation. The current "overrides"
      configuration doesn't match the value found in the lockfile
```

Es porque el Dockerfile copia `package.json` y `pnpm-lock.yaml`, pero **no `pnpm-workspace.yaml`**. En pnpm 10+ ese archivo no es sólo para monorepos: es el archivo de configuración de pnpm y contiene los `overrides`, `allowBuilds` y `minimumReleaseAgeExclude` con los que se generó el lockfile. Sin él, pnpm toma los `"overrides"` heredados de `package.json`, que no coinciden con el lockfile.

La corrección es copiarlo en la etapa de build:

```dockerfile
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
```

> **Importante:** no uses `pnpm install --no-frozen-lockfile` para “arreglarlo”: eso reescribe `pnpm-lock.yaml` y puede actualizar versiones de dependencias. Si tras copiar el archivo el install sigue fallando, revisá el diff del lockfile antes de regenerarlo.

### `postgres_18` termina con `exited with code 1`

Si en los logs aparece:

```text
Error: in 18+, these Docker images are configured to store database data in a
       format which is compatible with "pg_ctlcluster"...
       Counter to that, there appears to be PostgreSQL data in:
         /var/lib/postgresql/data (unused mount/volume)
```

Es porque `postgres:18` cambió el layout del volumen: ya no acepta el mount en `/var/lib/postgresql/data`, sino en `/var/lib/postgresql`. El volumen debe declararse así:

```yaml
volumes:
  - postgres_data:/var/lib/postgresql
```

Si el volumen anterior está vacío o sólo tiene datos parciales de una inicialización fallida, se puede recrear la base desde cero (esto **borra** los datos del volumen):

```bash
docker compose down
docker volume rm postgresql_postgres_data
docker compose up -d
```

### pgAdmin: `The user does not have permission to read and write to the specified storage directory`

Ocurre si se monta una carpeta del host sobre el storage de pgAdmin, por ejemplo:

```yaml
- ./back-up:/var/lib/pgadmin/storage/root_admin.com  # ❌ no usar
```

Ese bind mount pisa los permisos que el contenedor ajusta al arrancar y el usuario `pgadmin` (uid 5050) no puede escribir. La solución es **eliminar esa línea** y dejar sólo el volumen:

```yaml
volumes:
  - pgadmin_data:/var/lib/pgadmin
```

Si el volumen ya quedó con `storage/` propiedad de `root`, se corrige con:

```bash
docker run --rm --user 0:0 -v postgresql_pgadmin_data:/v --entrypoint sh dpage/pgadmin4 `
  -c "chown -R 5050:0 /v/storage && chmod 700 /v/storage"
```

Luego reinicia pgAdmin:

```bash
docker compose up -d pgadmin
```

### Error de permisos al restaurar la base de datos (`Permission denied`)
Si la restauración del `.dump` falla por permisos, ejecuta en la consola de tu equipo:
- **En Linux/WSL/Git Bash:**
  ```bash
  chmod -R 777 postgreSql/back-up/
  ```
- **En Windows (PowerShell):**
  ```powershell
  icacls "postgreSql\back-up\switch_transaccional.dump" /grant Everyone:F
  ```
Posteriormente, reinicia la base de datos limpiando volúmenes:
```bash
docker compose down -v && docker compose up -d
```

## nota 
- ajustar las variables de entorno en cada proecto con las comentadas en la seccion #Docker configuration de los archivos .env de cada proyecto, para que se conecten correctamente a la base de datos y entre ellos.