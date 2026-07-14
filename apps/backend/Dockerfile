# syntax=docker/dockerfile:1

# --- build: instala tudo, compila (tsup empacota @wz/shared) e faz deploy prod ---
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @wz/backend build
RUN pnpm --filter @wz/backend deploy --prod /deploy

# --- runtime: só node_modules de produção + dist + migrações ---
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /deploy/node_modules ./node_modules
COPY --from=build /app/apps/backend/dist ./dist
COPY --from=build /app/apps/backend/drizzle ./drizzle
COPY --from=build /app/apps/backend/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/server.js"]
