# syntax=docker/dockerfile:1

# --- Etapa de build ---
FROM node:24-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Dependencias (capa cacheable)
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# Código, schema Prisma y configuración de build
COPY tsconfig.json tsconfig.build.json nest-cli.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

# Cliente Prisma generado + compilación a dist/.
# DATABASE_URL ficticia: `generate` no se conecta, pero prisma.config.ts la
# exige y el .env real queda fuera de la imagen (.dockerignore).
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" pnpm exec prisma generate
RUN pnpm run build

# --- Etapa de runtime ---
FROM node:24-alpine AS runner

WORKDIR /app

# Producción: sin start:dev ni recarga en caliente.
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@latest --activate

# Se copia node_modules completo desde el build para conservar el cliente
# Prisma generado. El .env NUNCA entra a la imagen.
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts

EXPOSE 3001

USER node

CMD ["node", "dist/main.js"]
