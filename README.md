# WZ Connect

Control plane da suíte WZ — **aplicação compartilhada (React + Fastify) com arquitetura
Database Per Tenant**. Um banco central `WZ_CONNECT_CORE` cuida de autenticação global,
tenants, planos, módulos, subdomínios e credenciais dos bancos; cada empresa tem um banco
PostgreSQL exclusivo, subdomínio próprio e dados totalmente isolados.

> 📐 Arquitetura completa em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) e decisões em
> [`docs/adr/`](docs/adr/README.md).

## Monorepo

| Pacote            | Descrição                                                       |
| ----------------- | --------------------------------------------------------------- |
| `apps/backend`    | API Fastify + Drizzle ORM (control plane + resolução de tenant) |
| `apps/frontend`   | SPA React (Vite) — console de administração                     |
| `packages/shared` | Tipos e contratos compartilhados                                |

## Stack

Node.js 20+, Fastify 5, Drizzle ORM, PostgreSQL 16, React 19, Vite 6, TailwindCSS 4,
Vitest 2 (cobertura mínima 85%), pnpm workspaces, Docker.

## Leis do projeto

- **TDD** — teste antes do código (Red → Green → Refactor).
- **DRY** — sem duplicação; lógica comum em `packages/shared`.
- **Commit atômico** — Conventional Commits.
- **Cobertura ≥ 85%** nos módulos unit-testáveis (Vitest), travada em pre-push e CI.
- **Git flow** — `main` (produção) ← `develop` (integração) ← `feature/*`.

## Pré-requisitos

- Node.js 20+ e pnpm 9 (`corepack enable` ou `npm i -g pnpm`)
- Docker + Docker Compose

## Comandos

```bash
pnpm install            # instala dependências do workspace
pnpm dev                # backend + frontend em watch
pnpm test               # todos os testes
pnpm test:coverage      # testes com cobertura (min 85%)
pnpm lint               # lint de todos os pacotes
pnpm typecheck          # checagem de tipos

# Docker (dev)
docker compose up -d postgres-core         # sobe só o banco central
docker compose up -d --build               # stack completa
```

## Estrutura

```
apps/backend    apps/frontend    packages/shared    docs/
```

## Licença

Proprietário — WZ.
