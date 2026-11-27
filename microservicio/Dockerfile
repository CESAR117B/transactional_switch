# syntax=docker/dockerfile:1

# --- Etapa de build ---
FROM node:24-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --no-frozen-lockfile; else pnpm install; fi

COPY tsconfig.json tsconfig.build.json nest-cli.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

# Genera el cliente y tipos de Prisma en build, luego compila a dist/
RUN  pnpm run build

# --- Etapa de runtime ---
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --chown=node:node --from=build /app/package.json ./package.json
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/prisma ./prisma
COPY --chown=node:node --from=build /app/prisma.config.ts ./prisma.config.ts

RUN chown -R node:node /app

EXPOSE .env.PORT

USER node

CMD ["node", "dist/main.js"]