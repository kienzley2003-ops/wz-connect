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
  do CORE (9 tabelas, verificada em Postgres real), endpoint `/health`.
- **Fase 1 concluída** (2026-07-14, em `develop`): resolução de tenant por subdomínio (hook
  Fastify), `TenantConnectionRegistry` (Object Pool + LRU), contexto via `AsyncLocalStorage`
  (padrão `runTenantScope(done)` + store mutável, pois `enterWith` não atravessa a fronteira do
  hook), cifra de credenciais AES-256-GCM (ADR-006) e `TenantResolver` com cache TTL. E2E
  verificado: `GET /tenant/info` com `Host: demo.localhost` lê o banco isolado `wz_tenant_demo`.
  57 testes no backend. Seed de dev: `pnpm --filter @wz/backend db:seed-demo`.
- **Fase 2 concluída** (2026-07-14, em `develop`): autenticação global — Argon2
  (`@node-rs/argon2`), JWT RS256 + JWKS (`jose`), lockout (5→15min), sessão única (`sid` no
  token vs `sessao_ativa_id`). Rotas: `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`,
  `GET /.well-known/jwks.json` (isentas de tenant). Login E2E verificado (login, me, jwks, senha
  errada, invalidação da sessão anterior). Seed: `pnpm --filter @wz/backend db:seed-auth`
  (admin `admin@wzconnect.com` / `Admin@1234` + signing key). 84 testes no backend.
- **Licenciamento + habilitação de módulos concluídos** (2026-07-14, em `develop`, branch
  `feature/licensing`): entitlements (`resolveEntitlements`/`checkEntitlement` — planos com
  limites JSONB + módulos habilitados), claims **`tnt`/`roles`/`mods`** no token, login
  escopado ao tenant (exige membership), **binding subdomínio×`tnt`** no guard
  (403 `tenant_mismatch`) e **guard de módulo** (403 `module_not_enabled`). Rotas:
  `GET /entitlements`, `POST /entitlements/check`. E2E verificado (9 cenários). 106 testes.
  Seed: `pnpm --filter @wz/backend db:seed-licensing`.
- **Fase 3 concluída** (2026-07-14, em `develop`): sistema de módulos — `WzModule` (contrato),
  `ModulesRegistry` (registro, `enabledFor`, `missing`/drift), `registerModules` (monta cada
  módulo como **plugin Fastify encapsulado** sob `/modules/<key>` aplicando guard de auth +
  guard de módulo automaticamente), esqueletos `masterfila`/`agenda`, e **navegação dinâmica**
  no frontend (`buildNavItems` + `ModuleNav`, filtrando o catálogo compartilhado pelo claim
  `mods`). E2E verificado por API **e no navegador** (login em `demo.localhost:3001` → nav
  mostra só MasterFila). 119 testes no backend, 8 no frontend, 7 no shared.
- **Fase 4 concluída** (2026-07-14, em `develop`): provisionamento fim-a-fim — schema/migrações
  **do banco de tenant** (`drizzle/tenant`, `tenant_info`), `tenantDatabaseName` (valida o slug
  antes do `CREATE DATABASE`, que não aceita parâmetros), `PlacementRegistry` (Strategy do
  `db_placement`), `provisionTenant` (cria banco → migra → seed → credenciais cifradas → ativa)
  e `migrateAllTenants` (resiliente). Rotas: `POST /tenants`, `GET /tenants/:id`,
  `POST /tenants/:id/provisionar`. CLI: `pnpm --filter @wz/backend db:migrate-tenants`.
  E2E verificado: tenant `acme` criado do zero → banco `wz_tenant_acme` + `tenant_info` seedado
  → status `ativo` → resolve em `acme.localhost`; reprovisionar → 409. 158 testes no backend.
- **Hardening concluído** (2026-07-14, em `develop`, branch `feature/hardening`) — fechou as
  pendências acumuladas: **RBAC de plataforma** (coluna `platform_role` em `users`, claim
  `prole`, `createPlatformGuard`; `/tenants` e `/provisionar` agora exigem
  `platform_super_admin` → 403 `platform_role_required`), **rate limit** (200/min global +
  10/min em `/auth/login`, por IP — complementa o lockout por conta) e **OpenAPI/Swagger** em
  `/api/v1/docs` (as deps existiam desde a Fase 0 sem uso). Seeds: admin vira
  `platform_super_admin`; `operador@wzconnect.com`/`Operador@1234` é usuário comum (sem `prole`).
  171 testes no backend. **Sem TODOs pendentes no código.**
- **Fase 5 — lado do Connect concluído** (2026-07-14, em `develop`, branch `feature/connect-sdk`):
  - **`@wz/connect-sdk`** (novo pacote): verificação RS256 com cache de JWKS (rebusca em `kid`
    desconhecido = rotação, com cooldown anti-DoS), `hasModule`/`requireModule` offline pelo
    claim `mods`, e `checkEntitlement` fresco usando o **token do próprio usuário**.
    **Sem credencial M2M** — não foi construída porque a decisão de acesso ao banco a tornou
    desnecessária (ver emenda no ADR-011).
  - **Role de banco dedicada por tenant** (`wz_app_<slug>`), dona do banco, com `CONNECT`
    revogado do `PUBLIC` — e o CORE idem (migração `0002`). **Isolamento provado por E2E**:
    a credencial de um tenant é negada nos outros e no CORE.
  - **Credencial revelada só no provisionamento** (`POST /tenants/:id/provisionar`); não há
    endpoint de credencial em runtime. Rotação/remediação: `db:harden-tenants`.
  - `modules/masterfila` reposicionado como **console** do produto (as rotas de negócio ficam
    no app separado). 183 testes no backend, 26 no SDK.
- **Fase 6 concluída** (2026-07-14, em `develop`, branch `feature/bi`): BI por push (ADR-013) —
  contrato de métricas em `@wz/shared`, tabela `metric_snapshots` (unique por
  tenant/módulo/métrica/granularidade/bucket = **idempotência**), `toBucket` (UTC) e `summarize`
  (read model), `POST /metrics/ingest` + `GET /dashboard`, `reportMetrics` no SDK e **dashboard
  no console**. E2E verificado: push → painel soma 2 janelas (128); **reenvio não dobra**;
  módulo não contratado → 403; payload inválido → 400; tenant só vê as próprias métricas.
- **Próximo — Fase 5 (resto), único item de produto em aberto**: integrar o repo
  `wz-masterfila` (auth delegada via SDK, conexão dinâmica, remoção do `organizacao_id` via
  expand/contract, split do banco único). **Todas as fases dentro do Connect estão fechadas.**
  Depois: Fase 6 (BI por push + dashboard). **Sempre conferir a coluna Status em
  `docs/ARQUITETURA.md` §14 antes de anunciar a próxima fase** (fonte da verdade — já errei
  isso uma vez).

### Convenções de BI (Fase 6)

- Módulos reportam **valor de janela**, nunca eventos crus. O bucket é **renormalizado no
  servidor** (`toBucket`, UTC) — não confiar no que o cliente mandou.
- O **tenant vem do token** (`tnt`), nunca do corpo. Mesma regra vale para qualquer rota
  escopada a tenant.
- Idempotência vem do unique + `onConflictDoUpdate`. Ao acrescentar dimensão à métrica,
  **incluí-la no unique**, senão volta a duplicar.
- Regra de agregação fica em `core/bi/aggregate.ts` (função pura). Não recalcular em rota.

### Convenções de segurança de banco (Fase 5)

- **Cada tenant tem role própria** (`wz_app_<slug>`), dona do seu banco. A app e os produtos
  conectam com ela — **nunca** com o superusuário.
- **`REVOKE CONNECT ... FROM PUBLIC` é obrigatório** em todo banco novo: o PostgreSQL dá
  `CONNECT` ao `PUBLIC` por padrão, então **ser dono não isola**. Isso foi um vazamento real,
  pego por E2E. Ao criar banco fora do `provisionTenant`, replicar o revoke.
- Credencial de tenant é revelada **uma vez** (retorno do provisionamento). Não criar endpoint
  que sirva credencial em runtime — foi decisão explícita (emenda do ADR-011).
- Nome de role/banco e senha entram em DDL (sem bind): usar sempre `tenantRoleName()`,
  `tenantDatabaseName()` e `generateDatabasePassword()` (base64url, sem aspas).

### Convenções de segurança

- **Camadas de autorização**, nesta ordem de preHandler: `guard` (auth) → `createPlatformGuard`
  (papel de plataforma) ou `createModuleGuard` (módulo contratado). Os dois últimos dependem de
  `request.authUser`.
- Rota que atravessa tenants (gestão/provisionamento) **exige `platform_super_admin`**.
- **`buildApp` é async**: `register()` do Fastify é preguiçoso e rotas declaradas logo depois
  capturam só os hooks já existentes. Sem `await register(...)` antes das rotas, o rate limit
  (e qualquer hook global de plugin) **não se aplica** — falha silenciosa.
- Defesa em profundidade no login: rate limit por IP (10/min) + lockout por conta (5→15min).

### Convenções de provisionamento (Fase 4)

- **Dois conjuntos de migração**: CORE (`drizzle/core`, `db:migrate`) e tenant
  (`drizzle/tenant`, `db:migrate-tenants`). Gerar com `db:generate` e `db:generate-tenant`.
- Tabelas novas de módulo vão no **schema de tenant** (`src/db/tenant/schema.ts`) — schema
  combinado por tenant, evitando ordenação entre módulos.
- **Nunca** interpolar nome de banco sem passar por `tenantDatabaseName()` (CREATE DATABASE não
  aceita parâmetros ligados).
- Credenciais e ativação só depois de migrar+seedar: tenant quebrado nunca vira `ativo`.
- Migração destrutiva: **expand/contract obrigatório** (ADR-009) — roda em N bancos.

### Convenções de módulos (Fase 3)

- Adicionar um módulo: criar `src/modules/<key>/index.ts` exportando um `WzModule` e registrá-lo
  em `src/modules/index.ts` (`createModulesRegistry`). O prefixo e os guards vêm de graça.
- **Registro explícito, não `@fastify/autoload`** — decisão revista na emenda do ADR-007
  (determinismo + testabilidade). Não reintroduzir autoload sem novo ADR.
- Rotas do módulo acessam o banco do tenant via `getTenantDb()`/`getTenantContext()`.
- Metadados de módulo (key/label/path) vivem em `@wz/shared` (`MODULE_CATALOG`) — fonte única
  para backend e frontend. Ao criar um módulo, adicione-o ao catálogo **e** à tabela `modules`
  do CORE (o seed faz isso em dev).

### Convenções de licenciamento

- Regra única de licenciamento em `core/licensing/entitlements.ts` (padrão Policy — DRY).
  Não duplicar checagem de limite/módulo em rotas.
- O guard de módulo usa o claim `mods` do token (rápido, sem DB); mudanças de módulo só valem
  após novo login. Já `/entitlements` lê o CORE (sempre fresco).
- Ordem dos preHandlers: guard de auth **antes** do guard de módulo (este depende de `authUser`).

### Convenções de tenancy (Fase 1)

- Acesso ao banco do tenant nos handlers: `getTenantDb()` de `tenancy/tenant-context` (nunca
  passar conexão por parâmetro).
- Rotas de plataforma (sem tenant) devem ser isentas via `isExempt` no `registerTenantResolution`.
- Módulos com I/O real (`*.factory.ts`, `create-tenant-resolver.ts`, repositórios, rotas) ficam
  fora da medição de cobertura; a lógica (crypto, subdomain, context, registry, resolver) é
  100% testada.

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
