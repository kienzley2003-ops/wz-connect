# Design — wz-connect, Frente A (Auth + Tenancy + Core / Identidade)

**Data:** 2026-08-06
**Branch de implementação:** `feature/auth-tenancy-core` (a partir de `develop`)
**Fonte canônica de escopo:** `docs/plano-divisao-mvp.md` §"Frente A"
**ADRs de referência:** 0003 (tenancy), 0004 (auth), 0005 (entitlements no token), 0007 (single-session), 0008 (auditoria), 0012 (segurança em camadas)

## 1. Objetivo e escopo

A Frente A é dona exclusiva de identidade, tenancy e auditoria do hub: as tabelas
`organizations`, `users`, `memberships`, `sessions`, `refresh_tokens`, `invites` e
`audit_events`. Os pacotes `packages/ui` e `apps/backend/src/db/schema.ts` são
somente-leitura durante o desenvolvimento paralelo com a Frente B (billing/catálogo)
— qualquer mudança neles vai em PR próprio contra `develop`.

Fora de escopo desta frente (pertence à Frente B): `products`, `plans`,
`plan_products`, `subscriptions`, `invoices`, `payments`, `feature_flags`,
onboarding passos 3-5 (checkout), telas de billing.

Contrato com a Frente B: `EntitlementsResolver` (`packages/shared/src/entitlements.ts`)
é consumido via stub (`{ planId: null, products: [] }`) até a integração final;
`POST /onboarding/organization` devolve `{ organizationId, userId }` para a
Frente B usar no passo 3 do wizard (checkout).

Estado do repositório confirmado: já é git, `develop` é a branch atual (HEAD em
`a147992`), `feature/auth-tenancy-core` já existe local e no remote, vazia.
Trabalho será feito direto nela, com commits granulares, sem branches extras.

## 2. Arquitetura

### 2.1 Backend (`apps/backend/src/`)

```
src/
├── server.ts                   # existente — registra plugins/fastify/swagger
├── env.ts                      # existente — zod parsing de env
├── db/
│   ├── client.ts                # existente
│   ├── schema.ts                 # existente (15 tabelas) — 1 migration aditiva nesta frente (ver §6)
│   └── migrate.ts                # existente
├── lib/
│   └── errors.ts                # NOVO — AppError e subclasses (ver §5)
├── tenancy/                     # NOVO — resolução de subdomínio (ADR 0003)
│   ├── plugin.ts                 # fastify-plugin: Host → request.tenant
│   └── resolver.ts               # slug → organizationId, cache em memória (TTL 60s)
├── auth/                        # NOVO — núcleo de auth (ADR 0004)
│   ├── plugin.ts                  # registra @fastify/cookie + hooks de sessão
│   ├── routes/
│   │   ├── login.ts                # POST /auth/login
│   │   ├── mfa-challenge.ts        # POST /auth/mfa (2º passo do login)
│   │   ├── refresh.ts              # POST /auth/refresh
│   │   ├── logout.ts               # POST /auth/logout
│   │   ├── me.ts                   # GET /auth/me
│   │   └── mfa.ts                  # GET /mfa/setup, POST /mfa/enable, POST /mfa/disable
│   ├── services/
│   │   ├── password.service.ts         # bcryptjs hash/verify
│   │   ├── token.service.ts            # assina access JWT (com products[]) + mint refresh
│   │   ├── session.service.ts          # cria/revoga sessions (single-session, ADR 0007)
│   │   ├── lockout.service.ts          # 5 falhas/30min
│   │   ├── csrf.service.ts             # double-submit cookie
│   │   ├── mfa.service.ts              # TOTP pure-Node
│   │   └── entitlements.service.ts     # stub do EntitlementsResolver
│   ├── hooks/
│   │   ├── require-auth.ts             # valida JWT + sessions.revoked_at + CSRF
│   │   └── require-role.ts             # gate por membership.role
│   └── lib/
│       ├── totp.ts                     # RFC 6238 puro
│       ├── refresh-token.ts            # gera/hashea/compara opaco
│       └── safe-compare.ts             # timing-safe equal
├── onboarding/
│   ├── routes.ts                # POST /onboarding/organization
│   └── service.ts               # cria org + admin + membership (transação)
├── memberships/
│   ├── routes.ts                # GET/POST/PUT /memberships
│   └── service.ts
├── invites/
│   ├── routes.ts                # POST /invites, GET /invites/:token, POST /invites/:token/accept
│   └── service.ts
├── audit/
│   ├── routes.ts                # POST /audit, GET /audit-events
│   └── service.ts
├── impersonation/
│   ├── routes.ts                # POST /impersonate/:organizationId
│   └── service.ts
└── users/ e super_admins/
    └── routes.ts                # Hub Admin: usuários globais, super-admins
```

**Princípios:** cada pasta é um bounded context alinhado ao schema. `routes.ts` é
thin (valida com Zod, chama service, retorna); toda lógica testável mora em
`service.ts`. Handlers Fastify não entram na cobertura obrigatória (ver §7); a
lógica em `services/` sim.

### 2.2 Frontend (`apps/frontend/src/`)

```
src/
├── main.tsx, App.tsx, index.css   # existentes
├── auth/
│   ├── api.ts                      # chama /auth/login, /refresh, /me
│   ├── context.tsx                 # AuthContext: user atual, mfaRequired, refetch
│   └── hooks.ts                    # useCsrf(), useInactivityLogout
├── pages/
│   ├── LoginPage.tsx                # email+senha, depois campo MFA se challenge
│   ├── MfaSetupPage.tsx             # QR + código, botão enable
│   ├── onboarding/
│   │   ├── WizardLayout.tsx
│   │   ├── Step1Organization.tsx    # nome, slug, cnpj?, billing_email
│   │   ├── Step2Admin.tsx           # email + senha do admin
│   │   └── Step2Success.tsx         # devolve organizationId para o wizard continuar (Frente B)
│   ├── org/                         # Org Admin (subdomínio da organização)
│   │   ├── AppShell.tsx              # @wz/ui AppShell — Usuários · Convites · Perfil
│   │   ├── UsersPage.tsx
│   │   ├── InvitesPage.tsx
│   │   ├── ProfilePage.tsx           # MFA setup, sessão ativa
│   │   └── AcceptInvitePage.tsx
│   └── hub/                         # Hub Admin (domínio apex, ver §3.3)
│       ├── AppShell.tsx
│       ├── OrganizationsPage.tsx     # lista + impersonate
│       ├── UsersPage.tsx
│       ├── SuperAdminsPage.tsx
│       └── AuditPage.tsx
└── lib/
    ├── api.ts                       # fetch wrapper: CSRF + credentials:include + 401→refresh
    └── tenant.ts                    # helpers de subdomínio (window.location.host)
```

Toda tela usa `@wz/ui` (Button, Card, Badge, Modal, Spinner, Toast, Input,
AppShell, useDarkMode) — nunca Tailwind ad-hoc, conforme `docs/design-system.md`.

## 3. Componentes backend

### 3.1 Tenancy (`tenancy/`)

- `resolver.ts`: `resolveOrgFromHost(host): Promise<{id, slug} | null>`, cache
  `Map` com TTL 60s, invalidado quando `POST /onboarding/organization` cria slug novo.
- `plugin.ts`: hook `preHandler` global. Normaliza `host` (remove porta), extrai
  subdomínio. Rotas públicas (`/health`, `/auth/login`, `/docs`,
  `/onboarding/organization`) seguem sem tenant. Demais rotas: se não resolver
  → `400 TENANT_NOT_FOUND`.
- **Domínio apex do Hub Admin:** o host igual a `BASE_DOMAIN` (sem subdomínio,
  ex. `localhost:3000` em dev, `wz-hub.com` em produção) resolve
  `request.tenant = null` **intencionalmente** — é o domínio do Hub Admin, não
  um erro. Rotas de Hub Admin (`/impersonate/*`, `/organizations` em modo
  global, `/users` globais, `/super_admins/*`) checam `require-role('super_admin')`
  em vez de depender de `request.tenant`.

### 3.2 Auth (`auth/`)

Mesma decomposição de serviços puros e pequenos discutida no brainstorming:
`totp.ts`, `refresh-token.ts`, `safe-compare.ts` (libs puras, 100% cobertura),
`password.service.ts` (bcryptjs cost 12), `lockout.service.ts` (5 falhas → 30min),
`csrf.service.ts` (double-submit), `mfa.service.ts` (setup/verify/enable/disable
com secret criptografado via `scryptSync(JWT_SECRET, userId)`).

`token.service.ts` — **ajustado no §6.2**: `signAccess({ sub, org, role, session,
impersonatedBy })` agora também chama `entitlementsResolver.getActiveEntitlements(org)`
e inclui `products: string[]` no payload, conforme ADR-0005. Quando `org` é `null`
(sessão de super_admin no domínio apex), `products` é `[]` e a claim `org` fica
ausente do payload (não `null` — omitida, para o SDK downstream não precisar
tratar tenant nulo como caso especial).

`session.service.ts` — `createOrRotate(userId, orgId | null)`: revoga sessão
anterior do mesmo `(user_id, organization_id)` (`organization_id IS NULL` conta
como um par válido para super_admin), invalida os `refresh_tokens` dessa sessão,
cria a nova sessão — tudo em transação `SERIALIZABLE` (ou lock advisory por
`(user_id, organization_id)`) para evitar duas sessões simultâneas em logins
concorrentes.

`entitlements.service.ts` — stub que implementa `EntitlementsResolver`
(`packages/shared/src/entitlements.ts`), injetado por composição no `server.ts`
para poder ser trocado por mock nos testes e pela implementação real da Frente B
na integração final.

Hooks: `require-auth.ts` valida JWT (`algorithms: ['HS256']` explícito — nunca
aceita `none`), confere `sessions.revoked_at IS NULL`, decora
`request.user = { id, org, role, session, impersonatedBy, products }`.
`require-role.ts` é uma factory (`requireRole('admin')`) usada em rotas de
memberships/invites/impersonation.

### 3.3 Onboarding

`POST /onboarding/organization` — body `{ name, slug, cnpj?, billing_email,
admin: { email, password } }`. Transação: `INSERT organizations` → `INSERT users`
(admin, senha via `password.service.hash`) → `INSERT memberships` (`role='owner'`,
`status='active'`). **Sem campo de status na org** (§6.5 — confirmado que não é
escopo da Frente A). Emite access+refresh+csrf (owner já fica logado). Grava
`audit_events('organization.created')`. Retorna `{ organizationId, userId }`.

### 3.4 Memberships e Invites

Memberships: toda query filtra por `request.tenant.id` (helper `withOrg`);
`PUT /memberships/:id` só muda `role`, restrito a `owner`/`admin`.

Invites — desenho revisado em §6.3 para aproveitar `membershipStatusEnum`
já ter o valor `'invited'`:
- `POST /invites`: se o e-mail já corresponde a um `users` existente, cria a
  `membership` **imediatamente** com `status='invited'` (junto com a linha em
  `invites`); se o e-mail é novo, só cria a linha em `invites` (a `membership`
  nasce no accept).
- `POST /invites/:token/accept`: se a `membership` já existe (caso 1), apenas
  vira `status='active'` e marca `invites.accepted_at`. Se não existe (caso 2),
  cria `users` (o próprio formulário de aceite coleta a senha escolhida pelo
  convidado — sem senha aleatória, sem campo `must_reset_password`) e a
  `membership` já nasce `status='active'`.
- Mismatch de e-mail entre sessão logada e `invites.email` → `403`.

### 3.5 Audit

`audit({ actorId, impersonatedBy, organizationId, product, action, target?,
metadata?, ip, userAgent })` — helper síncrono chamado explicitamente pelos
services sensíveis (login, membership.role_changed, invite.created, etc.), não
um hook automático. `organizationId` pode ser `null` (ações de Hub Admin — o
schema já suporta isso, `audit_events.organization_id` já é nullable).
`GET /audit-events` filtra por org (Org Admin) ou é global (Hub Admin/super_admin).

### 3.6 Impersonation

Redesenhado em §6.4 para não exigir schema novo nem lógica de "restaurar sessão":

`POST /impersonate/:organizationId` (exige `request.user.role === 'super_admin'`,
verificado via `users.is_super_admin`) — **não cria uma nova `sessions`**. Emite
um access JWT adicional (mesmos 15min) com `org: target`, `role: 'owner'`
(intencional — impersonation dá acesso de suporte completo à organização, não
apenas o papel que o super_admin teria se fosse membro dela), `session: <sessão
hub existente do super_admin>`, `impersonatedBy: masterId`.
Grava `audit_events('impersonation.start')`. O frontend guarda o token original
(sem `org`) em memória, à parte do token de impersonation.

Sair da impersonation: o frontend descarta o token de impersonation e volta a
usar o original guardado em memória; se esse já expirou, `POST /auth/refresh`
com o refresh token original (nunca tocado durante a impersonation) reemite um
access token limpo. Nenhum endpoint `/impersonate/exit` é necessário.

Toda ação subsequente sob impersonation propaga `impersonatedBy` do JWT para
`audit_events` via o helper `audit()`.

### 3.7 Plugins Fastify e convenções

`@fastify/cookie` (access/refresh/csrf em cookies), `@fastify/jwt` (HS256),
`@fastify/rate-limit` (200/min global, 10/min em `/auth/login` — ADR-0012),
`@fastify/helmet` (CSP estrita, X-Frame-Options, X-Content-Type-Options,
Referrer-Policy), CORS restrito a `*.{BASE_DOMAIN}` + domínios explícitos dos
módulos consumidores (sem wildcard `*`). Zod schemas ao lado de cada
`routes.ts`. Sem `try/catch` em `routes.ts` — erros tipados sobem até o handler
global (§5).

## 4. Fluxo de dados

### 4.1 Login (happy path + MFA)

```
POST /auth/login { email, password }
  → tenancy: resolve org do Host (ou null, no domínio apex)
  → rate limit 10/min
  → user = SELECT users WHERE email = ?
  → lockout.assertNotLocked(user)               [423 se bloqueado]
  → password.verify(password, user.password_hash) [401 se inválido → lockout.recordFailure]
  → SE org != null: membership = SELECT ... WHERE user_id=? AND organization_id=?
      não existe → 403 NOT_A_MEMBER
    SE org == null (domínio apex): exige user.is_super_admin = true → 403 senão
  → SE user.mfa_enabled:
      retorna { mfaChallenge: <jwt 60s, purpose='mfa', sub=user.id, org=org?.id> }
      — nenhuma sessão é criada e nenhum refresh é mintado ainda; a sessão
        anterior do usuário (se existir) continua ativa até o MFA ser confirmado
  → SENÃO:
      session.createOrRotate(user.id, org?.id ?? null)
      → refresh = token.mintRefresh(user.id, session.id)
      → products = entitlementsResolver.getActiveEntitlements(org.id)  [org != null]
      → access = token.signAccess({ sub, org, role, session, products })
      → csrf = csrf.issue()
      → retorna { access, refresh, csrf, user }

POST /auth/mfa { mfaChallenge, code }
  → valida challenge (60s, one-shot) e código TOTP
  → só agora: session.createOrRotate(...) → refresh → products → access → csrf
  → retorna { access, refresh, csrf, user }
```

Nota de segurança: adiar `session.createOrRotate` para depois da confirmação de
MFA é deliberado — criar a sessão (o que revoga a sessão anterior, ADR-0007)
antes do segundo fator estar confirmado deixaria um atacante que só descobriu a
senha derrubar a sessão legítima do usuário sem nunca completar o login.

### 4.2 Single-session (ADR 0007)

```sql
BEGIN SERIALIZABLE;
  SELECT id FROM sessions
    WHERE user_id=X AND organization_id IS NOT DISTINCT FROM Y AND revoked_at IS NULL
    FOR UPDATE;
  UPDATE sessions SET revoked_at = now() WHERE ...;
  UPDATE refresh_tokens SET revoked_at = now()
    WHERE session_id IN (SELECT id FROM sessions WHERE user_id=X AND organization_id IS NOT DISTINCT FROM Y)
      AND revoked_at IS NULL;
  INSERT INTO sessions (...) RETURNING *;
  INSERT INTO refresh_tokens (...);
COMMIT;
```

`IS NOT DISTINCT FROM` em vez de `=` porque `organization_id` agora pode ser
`NULL` (super_admin) — `NULL = NULL` é `NULL` em SQL, não `true`; a comparação
correta com nullable exige esse operador.

Cada request autenticado confere `sessions.revoked_at IS NULL` — se revogado,
`401 SESSION_REVOKED` mesmo com token ainda dentro dos 15min.

Heurística de replay em `POST /auth/refresh`: se o refresh recebido já está
revogado mas foi criado há menos de 5s, revoga toda a família de tokens da
sessão (mesma prática do `wz-agente`).

### 4.3 Tenancy

```
Host: acme.wz-hub.com  → sub='acme' → resolver (cache 60s) → request.tenant={id,slug}
Host: wz-hub.com (apex) → request.tenant = null (Hub Admin, não erro)
Host: desconhecido      → 400 TENANT_NOT_FOUND (exceto rotas públicas)
```

### 4.4 Onboarding

```
POST /onboarding/organization {...}
  → valida slug único (409 se duplicado)
  → BEGIN: INSERT organizations, INSERT users (admin), INSERT memberships (owner, active) → COMMIT
  → emite access+refresh+csrf (owner logado)
  → audit('organization.created')
  → return { organizationId, userId }
```

Frontend guarda `organizationId` no estado do wizard; a Frente B usa esse valor
no passo 3 (checkout) — fora do escopo desta frente.

### 4.5 Aceitar invite

```
GET /invites/:token           → preview { organizationName, role, expiresAt } (anônimo)
SE não logado                 → /login?next=/accept-invite?token=xyz
POST /invites/:token/accept   → ver §3.4 (dois casos: membership pré-existente vs. novo user)
```

### 4.6 SDK — superfície exposta nesta frente

```ts
export const connect = {
  auth: {
    verifyToken(token: string): ConnectJWTPayload   // HS256, valida exp + iss + algorithms:['HS256']
    refresh(refreshToken: string): Promise<{ accessToken, refreshToken, csrfToken }>
  },
  audit: {
    log(event: AuditEventInput): Promise<void>       // POST /audit
  },
} as const
```

`verifyToken` valida com a mesma `JWT_SECRET`/`CONNECT_JWT_SECRET` que
`wz-desk` já usa — nenhuma mudança é exigida no lado do `wz-desk` além de
trocar a validação manual pelo pacote.

## 5. Error handling

Erros tipados com `code` estável (kebab-case, chaveável por i18n no frontend):

```ts
export class AppError extends Error {
  constructor(public code: string, public statusCode: number, message: string,
    public details?: Record<string, unknown>) { super(message) }
}
```

Subclasses: `LockedAccountError` (423), `InvalidCredentialsError` (401),
`MfaRequiredError`/`MfaInvalidError`/`MfaNotEnrolledError` (401/401/400),
`CsrfMismatchError` (403), `SessionRevokedError` (401), `TenantNotFoundError`
(400), `NotAMemberError` (403), `ImpersonationForbiddenError` (403),
`CrossOrgAccessError` (403).

Handler global: `AppError` → `{ error: { code, message, details } }` +
`statusCode`; erros de validação Zod → `400 validation-error`; `429` do
rate-limit → mensagem amigável; qualquer erro não mapeado → `500 internal`
sem vazar stack/mensagem em produção (loga via pino em `error`).

Segurança defensiva: comparação de senha via `bcryptjs.compare` (constant-time
nativo da lib); refresh token e CSRF comparados com `safeEqual`; JWT sempre
verificado com `algorithms: ['HS256']` explícito; Drizzle parametrizado (nunca
`sql.raw` com input do usuário); pino redaction em `password`,
`password_hash`, `mfa_secret_encrypted`, `cookie`, `authorization`.

## 6. Ajustes de schema e correções encontradas na consolidação

Estes seis pontos foram descobertos comparando o design discutido no
brainstorming com o `schema.ts` real e os ADRs já aceitos — aprovados pelo
usuário em 2026-08-06 antes da escrita deste spec:

1. **`sessions.organization_id` vira nullable.** Migration aditiva
   (`ALTER TABLE sessions ALTER COLUMN organization_id DROP NOT NULL`), não
   perde dado, não exige o snapshot pré-migration do ADR-0012 (que só se aplica
   a `DROP COLUMN`/`DROP TABLE`/mudança de tipo com perda). Necessário porque
   `PRODUCT.md` §7 decisão #4 define super_admin como role global sem
   `organizationId`, mas o schema atual não permite sessão sem org.
2. **Access JWT ganha `products: string[]`**, conforme ADR-0005 — ausente na
   proposta original de `token.service.ts`.
3. **Invite aproveita `membershipStatusEnum.invited`** já existente no schema —
   elimina a necessidade de um campo `users.must_reset_password` cogitado
   inicialmente.
4. **Impersonation não cria `sessions` nova nem precisa de campo de metadata**
   — resolvida via token adicional de curta duração sobre a sessão hub
   existente (§3.6). Elimina a necessidade de um campo
   `sessions.impersonation` cogitado inicialmente.
5. **`organizations.status` (`pending_plan`) fica fora do escopo desta frente**
   — confirmado que a Frente B é quem introduz esse conceito via `subscriptions`.
6. **Divergência de MFA "obrigatório" (ADR-0004/PRODUCT.md) vs. "opcional"
   (`plano-divisao-mvp.md`, visão MVP completo) registrada, não escondida:**
   a Frente A entrega a infraestrutura completa de MFA (setup, enable,
   disable, challenge no login), mas o **enforcement duro** — bloquear ações
   de um `owner`/`super_admin` sem MFA habilitado — fica fora do escopo do
   MVP. UI mostra um aviso ("recomendamos ativar MFA"), sem bloqueio de rota.
   Pode ser endurecido depois sem mudança de schema (o campo `mfa_enabled` já
   existe e já é checado no login).

## 7. Testes

Política: ≥85% de cobertura em código unit-testável (mesma régua de
`wz-masterfila`/`wz-agente`, enforced por Husky pre-push). Excluídos da
medição: `routes/*.ts` (cobertos por teste de integração, não unitário),
páginas React, `server.ts`, `migrate.ts`.

Suítes obrigatórias:

| Arquivo | Tipo | Cobre |
|---|---|---|
| `auth/lib/totp.test.ts` | unit | secret base32, TOTP determinístico, janela ±1 |
| `auth/lib/refresh-token.test.ts` | unit | entropia, hash determinístico, safeEqual |
| `auth/services/password.service.test.ts` | unit | salt distinto por hash, verify aceita/rejeita |
| `auth/services/lockout.service.test.ts` | unit | 5 falhas → lockedUntil, 30min destrava |
| `auth/services/token.service.test.ts` | unit | JWT HS256 decodificável, exp 15min, `products[]` presente |
| `auth/services/session.service.test.ts` | integration (DB) | revoga sessão anterior, concorrência não duplica, replay em 5s revoga família, `organization_id IS NULL` funciona (super_admin) |
| `auth/services/csrf.service.test.ts` | unit | issue/verify double-submit |
| `auth/services/mfa.service.test.ts` | unit | setup/verify/enable/disable, janela ±1 |
| `auth/services/entitlements.service.test.ts` | unit | stub retorna `{ planId: null, products: [] }` |
| `auth/hooks/require-auth.test.ts` | unit (mock) | rejeita sessão revogada, propaga `impersonatedBy` |
| `auth/hooks/require-role.test.ts` | unit | aceita/rejeita por role |
| `tenancy/resolver.test.ts` | unit | cache hit/miss, TTL |
| `tenancy/plugin.test.ts` | integration | apex → tenant null, subdomínio inválido → 400 |
| `lib/errors.test.ts` | unit | serialização estável de cada `AppError` |
| `onboarding/service.test.ts` | integration (DB) | cria org+user+membership atomicamente, slug duplicado → 409 |
| `memberships/service.test.ts` | integration | CRUD filtra por org, cross-org → 403 |
| `invites/service.test.ts` | integration | invite p/ user existente (`invited`→`active`), invite p/ email novo (cria user no accept), expira, mismatch de email → 403 |
| `audit/service.test.ts` | integration | grava, propaga `impersonatedBy`, `organization_id` null em ações de hub |
| `e2e/login-flow.test.ts` | e2e | login → MFA → refresh → logout → refresh revogado → 401 |
| `e2e/single-session.test.ts` | e2e | login em 2 dispositivos → primeiro desloga |
| `e2e/impersonation.test.ts` | e2e | super_admin impersona → audit tem `impersonatedBy` correto → token de impersonation expira e volta ao token original |

Setup: unitários sem DB (mock de `db/client`); integração roda contra
`wz_connect_test` em `localhost:5435` (mesmo Postgres do dev, DB separado),
`TRUNCATE` em ordem reversa de FK no `beforeEach`; e2e sobe `docker compose`
completo, marcado `slow`, só roda no CI.

## 8. Fora de escopo desta frente

- Onboarding passos 3-5 (checkout, Stripe) — Frente B.
- Telas/rotas de `products`, `plans`, `subscriptions`, `invoices`, `feature_flags` — Frente B.
- Enforcement duro de MFA obrigatório para owner/super_admin (ver §6.6) — iteração futura.
- Migração de `wz-masterfila`/`wz-desk`/`wz-orc`/`wz-agente` para consumir o Connect — congelados, registrados em `docs/pendencias/*`.
- Endpoint `/impersonate/exit` — desnecessário no desenho atual (§3.6).
- `CI` (`.github/workflows/ci.yml`) — mencionado como necessário mas não é parte do código desta frente; abrir como tarefa separada se o usuário quiser antes do primeiro PR.
