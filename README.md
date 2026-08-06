# WZ Connect

Auth + Tenancy + Catálogo/Planos do wz-hub. Ver `PRODUCT.md` para o documento vivo de produto, `docs/adr/` para as decisões arquiteturais e `docs/design-system.md` para o padrão visual do hub.

## Stack

- **Backend:** Node.js 20 LTS, Fastify 5.x, Drizzle ORM, PostgreSQL 16
- **Worker:** BullMQ + Redis (NF-e, retry de webhook — ver ADR 0011)
- **Frontend:** React 19, TypeScript 5, Vite 6, TailwindCSS 4
- **Design system:** `@wz/ui`, extraído do `wz-agente` (ver `docs/design-system.md`)
- **Infra:** Docker Compose (Postgres + Redis), pnpm workspaces 9.x
- **Testes:** Vitest 2.x (≥85% cobertura, mesma política do wz-masterfila/wz-agente)

## Estrutura

```
wz-connect/
├── apps/
│   ├── backend/     # API Fastify — health check em /api/v1/health, Swagger em /api/v1/docs
│   ├── worker/      # BullMQ + Redis — jobs de NF-e e retry de webhook
│   └── frontend/    # React + Vite — Hub Admin (/hub) e Org Admin (/app)
├── packages/
│   ├── shared/      # Tipos e contratos compartilhados (ver EntitlementsResolver)
│   ├── connect-sdk/ # SDK público consumido por wz-desk, wz-masterfila, wz-orc, wz-agente
│   └── ui/          # @wz/ui — design system compartilhado (ver docs/design-system.md)
├── docs/
│   ├── adr/         # Architecture Decision Records (0001-0013)
│   ├── pendencias/  # Dependências futuras dos sistemas congelados do wz-hub
│   └── design-system.md
└── PRODUCT.md       # Documento vivo de produto
```

## Início Rápido

### Pré-requisitos

- Docker Desktop (para Postgres + Redis locais)
- Node.js 20 LTS + pnpm 9.x

```bash
corepack enable && corepack prepare pnpm@9.15.0 --activate
```

### Setup local

```bash
# 1. Instalar dependências do monorepo
pnpm install

# 2. Copiar variáveis de ambiente
cp .env.example .env
# Editar .env se necessário (valores padrão já funcionam em dev local)

# 3. Subir Postgres + Redis
docker compose up -d

# 4. Aplicar a primeira migration
pnpm --filter @wz/connect-backend db:migrate

# 5. Rodar tudo em modo dev (backend + worker + frontend)
pnpm dev
```

- Backend: `http://localhost:3000` (health check em `/api/v1/health`, Swagger em `/api/v1/docs`)
- Frontend: `http://localhost:3002` (`/hub` para Hub Admin, `/app` para Org Admin)
- Postgres: `localhost:5435` (evita conflito com wz-masterfila `5433`, wz-desk/wz-agente `5432`, wz-orc `5434`)
- Redis: `localhost:6381`

### Comandos úteis

```bash
pnpm build              # build de todos os workspaces
pnpm test                # testes de todos os workspaces
pnpm test:coverage       # cobertura ≥85%
pnpm lint                # lint de todos os workspaces
pnpm --filter @wz/connect-backend db:generate  # gera nova migration a partir do schema.ts
pnpm --filter @wz/connect-backend db:migrate   # aplica migrations pendentes
```

## Estado atual

- ✅ 13 ADRs aceitas (`docs/adr/`)
- ✅ Schema Drizzle core modelado (`apps/backend/src/db/schema.ts`) — 15 tabelas + schema `worker`
- ✅ Design system extraído do `wz-agente` e portado para `@wz/ui`
- ✅ Scaffold do monorepo rodável (backend, worker, frontend sobem sem erro; primeira migration gerada em `apps/backend/drizzle/0000_cooing_skullbuster.sql`)
- ⏳ Rotas de negócio (auth, billing, onboarding) — em desenvolvimento paralelo em duas frentes, ver [`docs/plano-divisao-mvp.md`](docs/plano-divisao-mvp.md)

## Desenvolvimento em duas frentes

O MVP está dividido em duas frentes paralelas, cada uma fullstack, para trabalho simultâneo por dois desenvolvedores. **Ver [`docs/plano-divisao-mvp.md`](docs/plano-divisao-mvp.md) para o detalhamento completo** (endpoints, telas, contrato entre frentes, regras de convivência).

- **`feature/auth-tenancy-core`** — Auth, tenancy, sessões, MFA, auditoria, impersonation (ADRs 0003, 0004, 0007, 0008)
- **`feature/billing-plans-catalog`** — Planos, catálogo, Stripe, NF-e, worker (ADRs 0005, 0006, 0009, 0010, 0011)

O contrato entre as duas frentes (interface `EntitlementsResolver`, fluxo de onboarding) está documentado no `packages/shared/src/entitlements.ts` e no plano de execução. `packages/ui` e `apps/backend/src/db/schema.ts` são tratados como somente-leitura durante o desenvolvimento paralelo — mudanças neles vão em PR próprio contra `develop`.
