# syntax=docker/dockerfile:1

# --- build: compila o SPA com Vite ---
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @wz/frontend build

# --- runtime: nginx servindo os estáticos ---
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
