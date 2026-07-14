# CLAUDE.md

Guia para o Claude Code (claude.ai/code) ao trabalhar neste repositório.

## Visão Geral

**WZ Connect** é o **control plane** da suíte WZ: uma **aplicação compartilhada (React +
Fastify) com arquitetura Database Per Tenant**. Um banco central `WZ_CONNECT_CORE` cuida de
autenticação global, tenants, planos, módulos, subdomínios e credenciais dos bancos; cada
empresa tem um banco PostgreSQL exclusivo, subdomínio próprio e dados totalmente isolados.

> 📐 Arquitetura completa em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) e decisões em
> [`docs/adr/`](docs/adr/README.md) (ADR-001..012). **Leia antes de mudanças estruturais.**

Projeto **separado** do `wz-masterfila` (repo próprio em `D:\Projetos\wz-connect`). O
MasterFila permanece como app à parte, integrado via `@wz/connect-sdk` (ver ADR-011).

## Monorepo (pnpm workspaces)

| Pacote            | Descrição                                                                      |
| ----------------- | ------------------------------------------------------------------------------ |
| `apps/backend`    | API Fastify 5 + Drizzle ORM + PostgreSQL (control plane + resolução de tenant) |
| `apps/frontend`   | SPA React 19 (Vite 6 + Tailwind 4) — console de administração                  |
| `packages/shared` | `@wz/shared` — tipos e contratos (Zod) compartilhados                          |

## Leis do Projeto (inegociáveis, verificadas em CI)

1. **TDD** — teste antes do código (Red → Green → Refactor). PR sem teste é bloqueado.
2. **DRY** — lógica comum em `packages/shared` ou módulo único. Sem duplicação.
3. **Commit atômico** — Conventional Commits (`feat:`, `fix:`, `test:`, `refactor:`, `chore:`, `docs:`, `build:`, `ci:`).
4. **Cobertura ≥ 85%** nos módulos unit-testáveis (Vitest), travada em pre-push (Husky) e CI.
5. **Design patterns** documentados via ADR.
6. **Git flow** — `main` (produção) ← `develop` (integração) ← `feature/*`, `fix/*`, `chore/*`.

## Stack

Node.js 20+, Fastify 5, Drizzle ORM, PostgreSQL 16, React 19, Vite 6, TailwindCSS 4,
Vitest 2 (provider de cobertura: **istanbul**), pnpm 9, Docker.

## Comandos

```bash
pnpm install            # instala dependências do workspace
pnpm dev                # backend + frontend em watch
pnpm test               # todos os testes
pnpm test:coverage      # testes com cobertura (gate 85%)
pnpm lint               # ESLint em todos os pacotes
pnpm format             # Prettier --write
pnpm typecheck          # tsc --noEmit em todos os pacotes

# Backend / banco
pnpm --filter @wz/backend db:generate   # gera migração Drizzle do CORE
pnpm --filter @wz/backend db:migrate    # aplica migrações no CORE

# Docker
docker compose up -d postgres-core      # sobe só o banco central (host: porta 5435)
docker compose up -d --build            # stack completa (postgres-core, backend, frontend, nginx)
```

## Arquitetura (resumo)

### Multi-tenant: Database Per Tenant

- **`WZ_CONNECT_CORE`** (1 banco central): auth global, `tenants`, `plans`, `modules`,
  `tenant_modules`, `memberships`, `tenant_databases` (credenciais **cifradas**), `signing_keys`, `audit_log`.
- **Banco do tenant** (1 por empresa): dados de negócio dos módulos habilitados.
- **Resolução por subdomínio** → lookup no CORE → conexão Drizzle dinâmica cacheada
  (Registry + Object Pool + `AsyncLocalStorage`). Ver ADR-004/005.

### Padrões

Repository (Drizzle), Registry+Object Pool (conexões), Adapter (`@wz/connect-sdk` e módulos),
Strategy (`db_placement`), Policy (autorização), plugins Fastify encapsulados (módulos).

## Cobertura — nota importante

O provider é **istanbul** (não v8). O `v8` gerava um "branch fantasma" na linha de `import` de
arquivos pequenos, poluindo o gate. Mantenha `istanbul` nos `vitest.config`. A cobertura mede
só módulos com lógica (`src/config/**`, `src/services/**`, `src/lib/**` no backend); contratos,
barrels e bootstrap de I/O (ex.: `load-dotenv.ts`) são excluídos.

## Estado atual

- **Fase 0 concluída** (2026-07-14): scaffold do monorepo, git flow, CI, Docker, schema+migração
  do CORE (9 tabelas, verificada em Postgres real), endpoint `/health`. 100% de cobertura.
- **Próximo — Fase 1**: resolução de tenant por subdomínio + `TenantConnectionRegistry` +
  contexto via `AsyncLocalStorage`. Ver roadmap em `docs/ARQUITETURA.md` §14.

## Particularidades do ambiente (máquina de dev)

- **`postgres-core` publica na porta 5435** no host (5432/5433/5434 já usadas por
  `wz-agente`/`wz-masterfila`/`wz-orc`).
- Copie `.env.example` para `.env` (gitignored). Variáveis: `CORE_DATABASE_URL`, `POSTGRES_*`,
  `JWT_SECRET` (≥32), `TENANT_CREDENTIALS_KEK` (≥32).
- Gere segredos: `openssl rand -base64 32`.

## Migrações (Database Per Tenant)

Dois conjuntos: **CORE** (`drizzle/core`, aplicado uma vez) e **tenant** (schema dos módulos,
aplicado a cada banco de tenant — orquestrador na Fase 4). **Migração destrutiva SEMPRE via
expand/contract** — nunca renomear/remover na mesma migração que introduz a forma nova (ADR-009).
