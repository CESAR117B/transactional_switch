FROM node:24-alpine

# Instalar pnpm de forma global
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copiar archivos de definición de dependencias
COPY package.json pnpm-lock.yaml* ./

# Instalar dependencias con pnpm
RUN pnpm install

# Copiar el resto del código fuente (incluye el archivo .env)
COPY . .

# El puerto del servidor se toma de PORT en /app/.env.
# dotenv (ya es dependencia) carga el .env al iniciar Node y no sobrescribe
# variables que ya vengan definidas en el entorno del contenedor.
ENV NODE_OPTIONS="-r dotenv/config"

# EXPOSE es solo metadata y no puede leer .env en tiempo de build.
# El puerto real en el que escucha NestJS lo define PORT en el .env (3000 por defecto).
EXPOSE 3000

# Ejecutar NestJS en modo desarrollo
CMD ["pnpm", "run", "start:dev"]