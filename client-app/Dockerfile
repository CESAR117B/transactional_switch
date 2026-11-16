# syntax=docker/dockerfile:1

# --- Etapa de build ---
FROM node:24-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Dependencias (capa cacheable)
# pnpm-workspace.yaml es el archivo de configuración de pnpm: contiene los
# `overrides` con los que se generó el lockfile. Sin él, pnpm usa los
# `overrides` de package.json y falla con ERR_PNPM_LOCKFILE_CONFIG_MISMATCH.
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile

# Código y configuración de build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src

# Compila a dist/ (incluye tsc --noEmit)
RUN pnpm run build

# --- Etapa de runtime ---
FROM node:24-alpine AS runner

WORKDIR /app

# Producción: desactiva Swagger (/doc) y el modo dev.
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@latest --activate

# Se copia node_modules completo desde el build para no depender de un
# `pnpm install --prod` en runtime (el .env NUNCA entra a la imagen).
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 3000

USER node

CMD ["node", "dist/main.js"]
