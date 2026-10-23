FROM node:24-alpine

# Instalar pnpm de forma global
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copiar archivos de definición de dependencias
COPY package.json pnpm-lock.yaml* ./

# Instalar dependencias con pnpm
RUN pnpm install

# Copiar el resto del código fuente
COPY . .

EXPOSE 3000

# Ejecutar NestJS en modo desarrollo
CMD ["pnpm", "run", "start:dev"]