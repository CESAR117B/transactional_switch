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
└── nesjs_server/
    └── docker-compose.yml
```

---

## 2. Requisitos Previos

- **Docker Desktop** instalado y en ejecución.
- Red de Docker creada para permitir la comunicación entre la base de datos y los microservicios.

Para crear la red compartida, ejecuta en la terminal:
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

2. Levanta los servicios con Docker Compose:
   ```bash
   docker compose up -d
   ```

3. **Verificación:**
   - **Base de datos:** Se habrá creado la base de datos `test` y se habrá ejecutado el script `init-switch.sh` para restaurar automáticamente el respaldo `.dump` en la base de datos `switch`.
   - **pgAdmin:** Accede a [http://localhost:5050](http://localhost:5050).
     - **Email:** `root@admin.com`
     - **Contraseña:** `admin`

---

### Fase 2: Desplegar el Microservicio y la Aplicación Cliente

1. Navega a la carpeta de servidores NestJS:
   ```bash
   cd ../nesjs_server
   ```

2. Construye las imágenes e inicia los contenedores:
   ```bash
   docker compose up -d --build
   ```

3. **Verificación:**
   - **Microservicio:** Disponible en [http://localhost:3001](http://localhost:3001).
   - **Client App:** Disponible en [http://localhost:3000](http://localhost:3000).

---

## 4. Gestión y Mantenimiento de Contenedores

### Ver el estado de los contenedores
```bash
docker ps
```

### Ver los logs en tiempo real
- **Logs de NestJS:**
  ```bash
  cd nesjs_server
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
cd nesjs_server
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