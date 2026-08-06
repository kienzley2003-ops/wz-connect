# Plano de Divisão do MVP em 2 Frentes Paralelas

**Status:** Design system e scaffold concluídos. Frentes A e B abertas para desenvolvimento.

> **Para quem chega neste documento agora:** se você foi instruído a "trabalhar na Frente A" ou "Frente B", leia a seção correspondente abaixo, crie a branch indicada (se ainda não existir) a partir de `develop`, e siga a lista de endpoints/telas. Não precisa esperar nada da outra frente — o contrato entre elas já está fixado e implementado como stub.

## Contexto

O `wz-connect` já tem 13 ADRs aceitas (`docs/adr/`) e o schema Drizzle core modelado (`apps/backend/src/db/schema.ts`). O trabalho de implementação do MVP é dividido entre **dois desenvolvedores em máquinas e contas diferentes** (cada um pode estar usando um agente de IA próprio) — este documento existe para que cada frente seja autossuficiente, sem depender de código real da outra até a integração final.

Decisões que moldaram esta divisão:
- Cada frente é **fullstack** (backend + as telas do seu domínio) — ninguém entrega só API esperando um "time de frontend" depois.
- A estética do `wz-agente` foi extraída e documentada em `docs/design-system.md`, e portada para o pacote `packages/ui` (`@wz/ui`) — **já pronto e commitado**, ambas as frentes o consomem como dependência estável.
- O scaffold do monorepo (backend, worker, frontend, packages, primeira migration) **já está pronto e commitado** em `develop` — nenhuma frente precisa configurar `pnpm-workspace.yaml`/Docker/migrations do zero.
- Os pontos de cruzamento entre as frentes (token com `products[]`, wizard de onboarding, auditoria) são resolvidos com **contrato de interface fixado neste documento** — cada frente implementa contra um stub, e a integração final é uma costura de poucas linhas, não um refactor.

## O que já está pronto (não repetir)

| Item | Onde | Commit |
|---|---|---|
| 13 ADRs aceitas | `docs/adr/0001` a `0013` | `9884444` |
| Schema Drizzle core (17 tabelas) | `apps/backend/src/db/schema.ts` | `5b4a4c1` |
| Design system extraído do wz-agente | `docs/design-system.md` | `f5f7a15` |
| `@wz/ui` (Button, Card, Badge, Modal, Spinner, Toast, Input, AppShell, useDarkMode, theme.css) | `packages/ui/` | `f5f7a15` |
| Scaffold do monorepo (backend/worker/frontend/packages, primeira migration) | raiz do repo | `2291de2`, `57a1c9b` |
| Backend sobe com health check + Swagger | `apps/backend/src/server.ts` | `2291de2` |
| Migration inicial aplicada e testada contra Postgres real (17 tabelas + partial unique index de `subscriptions`) | `apps/backend/drizzle/0000_cooing_skullbuster.sql` | `2291de2`, `57a1c9b` |

Setup local: ver `README.md` na raiz do repo (`pnpm install`, `docker compose up -d`, `pnpm --filter @wz/connect-backend db:migrate`, `pnpm dev`).

## O contrato entre as duas frentes

Três pontos de cruzamento, todos resolvidos com uma interface fixa + stub — **nenhuma frente espera código real da outra** para funcionar e testar de ponta a ponta.

### 1. Entitlements no token (`products[]`)

`packages/shared/src/entitlements.ts` já define a interface (commitada, pronta para uso):

```ts
export interface EntitlementsResolver {
  getActiveEntitlements(organizationId: string): Promise<{
    planId: string | null
    products: string[]
  }>
}
```

- **Frente A** (Auth) usa essa interface no serviço de login/refresh para montar o JWT. Durante o desenvolvimento, usa um **stub trivial** (retorna `{ planId: null, products: [] }` ou uma lista fixa para testes locais).
- **Frente B** (Billing) implementa a versão real (lendo `subscriptions` + `plan_products`) e a expõe via `packages/shared`.
- **Costura final:** trocar o stub pela implementação real no composition root do backend (`server.ts`), poucas linhas — injeção de dependência, não refactor.

### 2. Onboarding wizard (5 passos)

Passos 1–2 (empresa + usuário admin) são da **Frente A**; passos 3–4 (plano + checkout Stripe) são da **Frente B**; passo 5 (sucesso) é só redirect.

Contrato: `POST /onboarding/organization` (Frente A) cria a organização com um campo de status (`pending_plan`) e devolve `{ organizationId, userId }`. O frontend usa esse `organizationId` para navegar ao passo 3, que chama `POST /billing/checkout-session` (Frente B) — o único dado compartilhado é o `organizationId`, que já existe como FK no schema. **Nenhuma chamada de backend entre as duas frentes é necessária** — a costura acontece no frontend, passando o ID adiante.

### 3. Auditoria (`audit_events`) — dependência leve, não bloqueante

A Frente A constrói `POST /audit` + `audit.service.ts` como parte do trabalho de auth (login/logout já geram eventos de auditoria, então sai cedo). A Frente B consome via SDK (`connect.audit.log(...)`). Enquanto a Frente A não entrega, a Frente B usa um stub (`console.log` ou no-op) — troca trivial depois.

## Regras de convivência (evitam conflito de merge)

- **`apps/backend/src/db/schema.ts` é tratado como acordado/estável** — nenhuma frente edita colunas/tabelas já usadas pela outra sem avisar. Se precisar de algo novo, adiciona em uma migration própria aditiva.
- **`packages/ui` é somente-leitura durante o desenvolvimento das frentes.** Se faltar um componente, adicione em um PR próprio contra `develop` (não dentro da branch de feature) para que a outra frente também se beneficie e não haja duas versões divergentes do mesmo componente.
- **`packages/shared/src/types/index.ts`** — cada frente adiciona seus tipos em arquivo próprio (`organization.ts`, `user.ts` para A; `plan.ts`, `subscription.ts` para B) e reexporta no barril — reduz colisão de merge a uma linha por tipo.

## Frente A — Auth + Tenancy + Core (Identidade)

**Branch:** `feature/auth-tenancy-core`, a partir do commit de scaffold em `develop`.

**ADRs de referência:** [0003](adr/0003-tenancy-subdominio-jwt.md) (tenancy), [0004](adr/0004-auth-jwt-refresh-csrf-mfa-lockout.md) (auth), [0007](adr/0007-single-session-enforcement.md) (single-session), [0008](adr/0008-auditoria-central.md) (auditoria).

**Tabelas do schema.ts que possui:** `organizations`, `users`, `memberships`, `sessions`, `refresh_tokens`, `invites`, `audit_events`.

### Backend

- `POST /auth/login` — email+senha, bcryptjs, emite access JWT (15min) + refresh token (7d, rotativo) + CSRF cookie. Usa `EntitlementsResolver` (stub) para popular `products[]`.
- `POST /auth/refresh` — rotaciona refresh token.
- `POST /auth/logout` — revoga sessão.
- `GET /auth/me` — user + memberships.
- MFA: `GET/POST /mfa/setup`, `POST /mfa/enable`, `POST /mfa/disable` — TOTP pure Node.js (RFC 6238), sem lib externa.
- Lockout: 5 falhas / 30min, campos já no schema (`users.failedLoginCount`, `lockedUntil`).
- Tenancy: resolver de subdomínio (`organizations.slug` → `organizationId`), middleware que injeta `org` no contexto da requisição.
- Single-session: ao logar, revoga sessão anterior do mesmo `(user_id, organization_id)` (ver ADR-0007).
- `POST /onboarding/organization` — cria org + primeiro user admin (passos 1–2 do wizard).
- `POST /invites`, `POST /invites/:token/accept` — convite de usuário.
- `GET/POST/PUT /memberships` — CRUD de membros da org (Org Admin).
- `POST /audit` + `audit.service.ts` — grava em `audit_events`.
- `GET /audit-events` — filtros por org/actor/produto/data (Hub Admin vê tudo; Org Admin vê só sua org).
- Impersonation: `POST /impersonate/:organizationId` (super_admin only) — emite token com `impersonatedBy` setado; toda ação subsequente cai em `audit_events.impersonatedBy`.

### Frontend (Hub Admin + Org Admin, modo `auth`)

Todas as telas usam os primitivos de `@wz/ui` — `AppShell`, `Card`, `Button`, `Input`, `Badge`, `Modal`, `Spinner`, `Toast` — sem estilo ad-hoc.

- Tela de Login (com MFA quando habilitado).
- Onboarding wizard, passos 1–2 (dados da empresa, criar admin).
- Org Admin: Usuários (lista, convidar, suspender), Convites pendentes, Perfil pessoal (MFA, sessões ativas).
- Hub Admin: Organizações (lista, detalhe, impersonate com flag visual "você está impersonando X" — usar `Badge` variant de alerta), Usuários globais, Super-admins, Auditoria global.

### SDK (`packages/connect-sdk`, parte de auth)

- `connect.auth.verifyToken(token)` — valida JWT localmente (HS256).
- `connect.auth.refresh(refreshToken)`.
- `connect.audit.log(event)`.

## Frente B — Billing + Plans + Catalog (Comércio)

**Branch:** `feature/billing-plans-catalog`, a partir do commit de scaffold em `develop`.

**ADRs de referência:** [0005](adr/0005-entitlements-products-no-token.md) (entitlements), [0006](adr/0006-planos-e-limites.md) (planos), [0009](adr/0009-billing-stripe-webhook.md) (Stripe), [0010](adr/0010-nfe-via-nfeio.md) (NF-e), [0011](adr/0011-worker-compartilhando-db.md) (worker).

**Tabelas do schema.ts que possui:** `products`, `plans`, `plan_products`, `subscriptions`, `invoices`, `payments`, `webhook_events`, `feature_flags`, mais `worker.nfe_jobs` e `worker.webhook_retries`.

### Backend

- `GET/POST/PUT /products` (Hub Admin only) — CRUD de catálogo.
- `GET/POST/PUT /plans` (Hub Admin only) — CRUD de planos + `plan_products` (limites em JSONB).
- `POST /billing/checkout-session` — cria Stripe Checkout Session para a org (passo 3–4 do onboarding), trial 14 dias com cartão.
- `POST /webhooks/stripe` — processa os eventos do ADR-0009 (`customer.subscription.*`, `invoice.*`, `charge.refunded`), grava em `webhook_events` antes de processar (idempotência).
- `GET /billing/subscription` (Org Admin) — plano atual, próxima cobrança, status.
- `POST /billing/downgrade` — agenda troca de plano para fim do ciclo.
- `POST /billing/cancel` / `POST /billing/reactivate` — janela de 30 dias.
- Implementação real de `EntitlementsResolver` — plugada no composition root do backend na integração final.
- `GET/PUT /feature-flags` (Hub Admin) — toggle por org.
- Worker (`apps/worker`): processor de `worker.nfe_jobs` (chama NFe.io após `invoice.paid`), processor de `worker.webhook_retries` (backoff 1s→30s→5min→30min→2h).

### Frontend (Hub Admin + Org Admin, modo `billing`)

Mesma regra: todas as telas usam os primitivos de `@wz/ui` — inclusive os gráficos do Dashboard global devem seguir a paleta de `theme.css` (cores de série consistentes com `--color-success`/`--color-danger`/etc.).

- Onboarding wizard, passos 3–4 (seleção de plano, checkout Stripe embedado).
- Org Admin: tela de Assinatura (plano atual + próxima cobrança — versão simples do MVP, com nota de código já preparada para plugar gráfico de consumo em v1.1), Pagamento (método de pagamento via Stripe Elements).
- Hub Admin: Dashboard global (MRR, total de orgs ativas, novos signups — leitura direta de `subscriptions`/`invoices`, sem necessidade de data warehouse no MVP), Planos (CRUD), Produtos (CRUD), Feature flags.

### SDK (`packages/connect-sdk`, parte de billing)

- `connect.entitlements.check(organizationId, product)` — checagem online (fora do token, para os poucos casos que exigem consistência imediata, ver ADR-0005).
- `connect.entitlements.getActiveEntitlements(organizationId)` — a implementação real da interface do contrato.

## Estratégia de branch e merge

1. Cada dev cria sua branch a partir de `develop`: `feature/auth-tenancy-core` ou `feature/billing-plans-catalog`. Se a branch já existe, apenas `git pull` e continue.
2. Cada frente desenvolve e testa **isoladamente**, usando os stubs descritos no contrato.
3. **Ordem de merge sugerida:** Frente A (Auth) primeiro, porque a Frente B só precisa trocar um stub simples depois (o inverso não é verdade). Não é bloqueante — se Billing terminar primeiro, também pode mergear direto.
4. Depois dos dois merges: **integração final** — plugar a implementação real do `EntitlementsResolver` no composition root, testar o onboarding de ponta a ponta (passo 1 até 5), rodar a suíte completa de testes dos dois lados juntos.
5. Conflitos esperados: nenhum em `schema.ts` nem em `packages/ui` (regras de convivência acima); possíveis conflitos triviais em `packages/shared/src/types/index.ts` (linha de export) e `apps/backend/src/server.ts` (registro de rotas) — resolvidos por merge simples.

## Corte do MVP

**Entra no MVP:**
- Onboarding completo (5 passos) com plano Free e planos pagos via Stripe.
- Login, logout, refresh, MFA opcional, lockout, single-session.
- Org Admin: usuários, convites, perfil, assinatura (versão simples), pagamento.
- Hub Admin: dashboard global, organizações (+ impersonate), usuários globais, planos, produtos, feature flags, auditoria global.
- Billing: ciclo de vida completo via Stripe webhook (trial, past_due, cancel, reativação).
- NF-e emitida automaticamente após cada invoice paga.
- SDK com auth + entitlements básicos.

**Fica para v1.1 (não bloqueia o MVP):**
- Gráfico de consumo vs. limites na tela de Assinatura.
- Endpoint de refund dentro do Connect (MVP usa Stripe Dashboard direto).
- Rate limit por plano (MVP é só rate limit global).
- Migração real de `wz-masterfila`/`wz-desk`/`wz-orc`/`wz-agente` para consumir o Connect — conteúdo em `docs/pendencias/`, congelado até o Connect estar pronto e estável.

## Verificação

1. **Frente A (isolada):** suíte Vitest ≥85% no que for unit-testável; teste manual login → MFA → refresh → logout; teste manual de single-session (logar em duas abas, confirmar que a primeira é revogada).
2. **Frente B (isolada):** suíte Vitest ≥85%; teste manual de checkout Stripe em modo test (cartão `4242...`); webhook testado via Stripe CLI (`stripe listen --forward-to`); NF-e testada contra sandbox da NFe.io.
3. **Integração final:** onboarding de ponta a ponta (passo 1 ao 5); JWT emitido após onboarding carrega `products[]` correto vindo da assinatura recém-criada; auditoria mostrando eventos das duas frentes na mesma timeline; confirmação visual de que as telas parecem construídas pelo mesmo time.
4. `git status` nos 4 projetos congelados (`wz-masterfila`, `wz-desk`, `wz-orc`, `wz-agente`) continua limpo — nenhuma frente do MVP toca neles.

## Não-objetivos

- Migração real dos sistemas congelados para consumir o Connect.
- Publicação do `@wz/connect-sdk` em registry — MVP consome via workspace local.
- Definir qual pessoa pega qual frente — decisão de negócio, não técnica.
