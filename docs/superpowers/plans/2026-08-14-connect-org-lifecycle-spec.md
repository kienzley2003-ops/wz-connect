# Spec: Onboarding, Memberships & Invites (wz-connect — Plan 4 / Frente A)

> **Para agentes:** este documento é autocontido. Você não precisa abrir nenhum outro arquivo do repositório para implementar isto — todas as assinaturas, schemas e convenções que este trabalho consome já estão reproduzidas abaixo. REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para rastreamento.

## 0. Objetivo do produto

Deixar um novo cliente criar uma organização (e logar como seu owner), e deixar um owner/admin de organização gerenciar membros — diretamente ou via convite por e-mail. Este é o **Plano 4** de uma sequência de 5 planos ("Frente A" do MVP do `wz-connect`, um control plane de Auth + Tenancy + Planos). Os Planos 1–3 (primitivos de auth, infra de sessão/tenancy, rotas HTTP de login/MFA/refresh/logout) já estão **implementados e commitados** na branch `feature/auth-tenancy-core`. Auditoria e impersonation ficam para o Plano 5 — fora de escopo aqui.

## 1. Repositório e ambiente

- Raiz do projeto: `D:\Projects\wztech\wz-connect` — monorepo **pnpm** (não confundir com os outros projetos do hub `wztech`, que usam npm ou têm tooling diferente).
- Pacote alvo: `apps/backend`, nome do pacote `@wz/connect-backend`.
- Scripts relevantes (rodar sempre com `pnpm --filter @wz/connect-backend <script>` a partir da raiz do monorepo, ou diretamente de dentro de `apps/backend` sem o `--filter`):
  - `dev` → `tsx watch src/server.ts`
  - `build` → `tsc`
  - `test` → `vitest run` (aceita um path depois de `--`, ex: `pnpm --filter @wz/connect-backend test -- onboarding/service.test.ts`)
  - `test:coverage` → `vitest run --coverage`
  - `db:migrate` → `tsx src/db/migrate.ts`
- Stack: Fastify 5, Drizzle ORM 0.33, Zod 3, bcryptjs, Vitest 2.x com **Postgres real** (sem mocks — é a metodologia TDD do projeto).
- Variáveis de ambiente (`apps/backend/src/env.ts`, `.env` carregado da raiz do monorepo): `DATABASE_URL` (obrigatória), `JWT_SECRET` (obrigatória, mín. 32 chars), `BASE_DOMAIN` (default `localhost` — é o domínio "apex", sem subdomínio de organização), `PORT` (default 3000). As demais (`REDIS_URL`, `STRIPE_*`, `NFEIO_API_KEY`) não são usadas neste plano.
- Antes de rodar testes de integração ou o servidor: `docker compose up -d postgres` (a partir de `wz-connect/`) e, se as tabelas não existirem ainda, `pnpm --filter @wz/connect-backend db:migrate`.
- Convenção de módulos: ESM + resolução NodeNext — **todo import relativo termina em `.js`**, mesmo que o arquivo fonte seja `.ts` (ex.: `import { x } from '../lib/errors.js'`).

## 2. Padrão arquitetural já estabelecido (Planos 1–3)

Rotas Fastify finas → funções de serviço pequenas e puras → queries Drizzle contra Postgres real. Erros são lançados como subclasses de `AppError` e capturados por um error handler global do Fastify que mapeia `err.statusCode`/`err.code`/`err.message`/`err.details` para JSON `{ error: { code, message, details } }`. Toda tarefa de código segue TDD: teste falhando → implementação → teste passando → commit.

## 3. Blocos já existentes que este plano reutiliza

### 3.1 `apps/backend/src/lib/errors.ts` — `AppError` e subclasses existentes

```ts
export class AppError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AppError'
  }
}
```

Subclasses já existentes (reaproveitadas por este plano, não recriar): `LockedAccountError`, `InvalidCredentialsError`, `MfaRequiredError`, `MfaInvalidError`, `MfaNotEnrolledError`, `CsrfMismatchError`, `SessionRevokedError`, `TenantNotFoundError`, `NotAMemberError`, `ImpersonationForbiddenError`, `CrossOrgAccessError`, `InsufficientRoleError`, `UnauthenticatedError`. A **Tarefa 1** abaixo adiciona três novas: `SlugTakenError`, `InviteInvalidError`, `InviteEmailMismatchError`.

### 3.2 Serviços de auth (Planos 1–3, prontos para uso)

- `hashPassword(plain: string): Promise<string>` / `verifyPassword(plain, hash): Promise<boolean>` — `auth/services/password.service.ts` (bcryptjs, 12 rounds).
- `generateRefreshToken(): string` — `auth/lib/refresh-token.ts`. Gera 32 bytes aleatórios em base64url (string de 43 chars, padrão `/^[A-Za-z0-9_-]{43}$/`). Reaproveitado de forma genérica como gerador de token opaco — o token de convite usa exatamente o mesmo formato.
- `createOrRotateSession(db: Db, userId: string, organizationId: string | null): Promise<{ sessionId: string; refreshToken: string }>` — `auth/services/session.service.ts`. Revoga qualquer sessão ativa anterior para o par `(userId, organizationId)` antes de criar a nova (single-session enforcement — ADR-0007). `organizationId: null` é um valor válido.
- `issueCsrfToken(): string` — `auth/services/csrf.service.ts`.
- `createTokenService(jwt: JwtSigner, entitlements: EntitlementsResolver)` — `auth/services/token.service.ts`. Retorna `{ signAccess(params), verifyAccess(token), mintRefresh() }`.
  - `signAccess(params: { sub: string; org: string | null; role: string; session: string; impersonatedBy?: string }): Promise<string>` — embute `products: string[]` resolvido via `entitlements.getActiveEntitlements(org)` (array vazio quando `org` é `null`). Claim `org` só é incluída no payload quando não-nula.
  - `AccessTokenPayload = { sub: string; org?: string; role: string; session: string; products: string[]; impersonatedBy?: string }`.
- `stubEntitlementsResolver` — `auth/services/entitlements.service.ts`. Sempre retorna `{ planId: null, products: [] }`. É o resolver real ainda não existe (billing fica para outra frente) — usar este stub em toda rota/teste.
- `setAuthCookies(reply: FastifyReply, tokens: { access: string; refresh: string; csrf: string }): void` / `clearAuthCookies(reply)` — `auth/lib/set-auth-cookies.ts`. Seta `access_token`/`refresh_token` (`httpOnly: true`) e `csrf` (`httpOnly: false`, legível por JS), `sameSite: 'lax'`, `path: '/'`.

### 3.3 Hooks de auth

- `createRequireAuth(db: Db, jwt: JwtSigner, entitlements: EntitlementsResolver)` → preHandler Fastify — `auth/hooks/require-auth.ts`. Lê o cookie `access_token`, verifica o JWT, confirma que a sessão não foi revogada (`sessions.revokedAt IS NULL`) e seta `request.authUser: AccessTokenPayload`. Lança `UnauthenticatedError` (401) ou `SessionRevokedError` (401).
- `requireRole(...allowedRoles: string[])` → preHandler Fastify — `auth/hooks/require-role.ts`. Lança `InsufficientRoleError` (403) se `request.authUser.role` não estiver na lista. **Deve rodar depois de `requireAuth`** no array de `preHandler`.

### 3.4 Plugin de tenancy (já registrado pelo test harness — não precisa mexer)

`registerTenancyPlugin(app, db, { publicPaths?: string[] })` — `tenancy/plugin.ts`. Seta `request.tenant: { id: string; slug: string } | null` via hook `preHandler` global:
- Se o path da URL está em `publicPaths` → `tenant = null`.
- Se o header `Host` (sem porta) é igual a `env.BASE_DOMAIN` (domínio apex, ex.: `localhost`) → `tenant = null`. **É assim que onboarding e invite preview/accept funcionam pré-organização — essas rotas são chamadas no domínio apex.**
- Caso contrário, resolve a org pelo subdomínio; lança `TenantNotFoundError` (400) se não encontrar.

### 3.5 Harness de teste

```ts
// apps/backend/src/test-utils/build-app.ts
buildTestApp(db: Db, registerRoutes: (app: FastifyInstance) => Promise<void>): Promise<FastifyInstance>
```

Monta uma instância Fastify com plugins de cookie + JWT, o plugin de tenancy (`publicPaths: ['/api/v1/health']`), o error handler global `AppError`→JSON, e então chama seu `registerRoutes`. É isso que todo teste de rota usa — nunca importar o `server.ts` real nos testes.

### 3.6 Schema do banco (já existe — este plano **não adiciona nenhuma migration**)

```ts
export const membershipRoleEnum = pgEnum('membership_role', ['owner', 'admin', 'manager', 'operator', 'viewer'])
export const membershipStatusEnum = pgEnum('membership_status', ['active', 'invited', 'suspended'])

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 63 }).notNull().unique(),
  cnpj: varchar('cnpj', { length: 14 }),
  billingEmail: varchar('billing_email', { length: 255 }),
  billingAddress: jsonb('billing_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  mfaSecretEncrypted: text('mfa_secret_encrypted'),
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  isSuperAdmin: boolean('is_super_admin').notNull().default(false),
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const memberships = pgTable('memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  role: membershipRoleEnum('role').notNull().default('operator'),
  status: membershipStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}) // unique (userId, organizationId); index (organizationId)

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }), // nullable
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const invites = pgTable('invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  role: membershipRoleEnum('role').notNull().default('operator'),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}) // unique (token); index (organizationId)
```

Import: `import { organizations, users, memberships, sessions, refreshTokens, invites } from '../db/schema.js'`.

## 4. Restrições globais

- TDD obrigatório em toda tarefa de código (instrução padrão do usuário para este projeto).
- Cobertura ≥85%; arquivos de rota ficam fora do gate numérico (mesmo padrão de `vitest.config.ts` dos Planos 2–3).
- Imports relativos usam `.js` (NodeNext).
- **Nunca compare `Date.now()` com um timestamp do Postgres** — há drift de relógio de ~30s observado entre o Postgres Docker/WSL2 e o host Windows. Toda checagem de expiração roda dentro do Postgres via `sql\`... < now()\``, mesmo padrão do `withinReplayWindow` de `refresh.ts` (Plano 3) — ver Tarefa 6 (`previewInvite`/`acceptInvite` usam `sql<boolean>\`${invites.expiresAt} < now()\``).
- Nenhuma mudança de schema — `organizations`, `memberships`, `invites` são usadas exatamente como já existem (seção 3.6).
- Toda tarefa termina com um commit.

## 5. Tarefas de implementação

### Tarefa 1: Novas classes de erro — `SlugTakenError`, `InviteInvalidError`, `InviteEmailMismatchError`

**Arquivos:** Modificar `apps/backend/src/lib/errors.ts` e `apps/backend/src/lib/errors.test.ts`.

**Interfaces:** Produz `SlugTakenError` (409, `slug-taken`) — usada na Tarefa 2. `InviteInvalidError` (404, `invite-invalid`) e `InviteEmailMismatchError` (403, `invite-email-mismatch`) — usadas na Tarefa 6.

- [ ] **Passo 1 — testes que falham.** Adicionar `SlugTakenError, InviteInvalidError, InviteEmailMismatchError` à lista de imports em `errors.test.ts`, e dentro de `describe('subclasses de AppError', ...)`:

```ts
it('SlugTakenError usa status 409', () => {
  const err = new SlugTakenError()
  expect(err.code).toBe('slug-taken')
  expect(err.statusCode).toBe(409)
})

it('InviteInvalidError usa status 404', () => {
  const err = new InviteInvalidError()
  expect(err.code).toBe('invite-invalid')
  expect(err.statusCode).toBe(404)
})

it('InviteEmailMismatchError usa status 403', () => {
  const err = new InviteEmailMismatchError()
  expect(err.code).toBe('invite-email-mismatch')
  expect(err.statusCode).toBe(403)
})
```

- [ ] **Passo 2 — confirmar falha.** `pnpm --filter @wz/connect-backend test -- errors.test.ts` → FAIL (classes não exportadas ainda).

- [ ] **Passo 3 — implementar.** Adicionar ao final de `errors.ts`:

```ts
export class SlugTakenError extends AppError {
  constructor() {
    super('slug-taken', 409, 'Este slug já está em uso por outra organização')
  }
}

export class InviteInvalidError extends AppError {
  constructor() {
    super('invite-invalid', 404, 'Convite inválido ou expirado')
  }
}

export class InviteEmailMismatchError extends AppError {
  constructor() {
    super('invite-email-mismatch', 403, 'O convite foi emitido para outro e-mail')
  }
}
```

- [ ] **Passo 4 — confirmar sucesso.** `pnpm --filter @wz/connect-backend test -- errors.test.ts` → PASS (17 testes).

- [ ] **Passo 5 — commit.**

```bash
git add apps/backend/src/lib/errors.ts apps/backend/src/lib/errors.test.ts
git commit -m "test+feat(backend): add SlugTakenError, InviteInvalidError, InviteEmailMismatchError"
```

---

### Tarefa 2: `onboarding/service.ts`

**Arquivos:** Criar `apps/backend/src/onboarding/service.ts` e `apps/backend/src/onboarding/service.test.ts`.

**Interfaces:** Consome `hashPassword`, `createOrRotateSession`, `issueCsrfToken`, `createTokenService`/`JwtSigner` (seção 3.2), `SlugTakenError` (Tarefa 1). Produz `interface OnboardOrganizationInput { name: string; slug: string; cnpj?: string; billingEmail: string; admin: { email: string; password: string } }` e `onboardOrganization(db: Db, tokenService, input: OnboardOrganizationInput): Promise<{ organizationId: string; userId: string; access: string; refresh: string; csrf: string }>`. Consumida pela Tarefa 3.

- [ ] **Passo 1 — teste que falha:**

```ts
// apps/backend/src/onboarding/service.test.ts
import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { sql, eq } from 'drizzle-orm'
import Fastify, { type FastifyInstance } from 'fastify'
import fastifyJwt from '@fastify/jwt'
import { createDb, type Db } from '../db/client.js'
import { organizations, users, memberships } from '../db/schema.js'
import { onboardOrganization } from './service.js'
import { createTokenService } from '../auth/services/token.service.js'
import { stubEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { SlugTakenError } from '../lib/errors.js'
import { env } from '../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']
let app: FastifyInstance

beforeAll(async () => {
  app = Fastify()
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { algorithm: 'HS256', expiresIn: '15m' },
    verify: { algorithms: ['HS256'] },
  })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await pool.end()
})

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, users, memberships CASCADE`)
})

describe('onboardOrganization', () => {
  it('cria organização, admin e membership owner/active numa transação e loga o admin', async () => {
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const result = await onboardOrganization(db, tokenService, {
      name: 'Acme',
      slug: 'acme',
      billingEmail: 'billing@acme.com',
      admin: { email: 'owner@acme.com', password: 'Senha123!' },
    })

    const [org] = await db.select().from(organizations).where(eq(organizations.id, result.organizationId))
    expect(org.slug).toBe('acme')

    const [membership] = await db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, result.userId))
    expect(membership.role).toBe('owner')
    expect(membership.status).toBe('active')

    expect(tokenService.verifyAccess(result.access).org).toBe(result.organizationId)
    expect(result.refresh).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('lança SlugTakenError quando o slug já existe', async () => {
    await db.insert(organizations).values({ name: 'Acme', slug: 'acme' })
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)

    await expect(
      onboardOrganization(db, tokenService, {
        name: 'Acme 2',
        slug: 'acme',
        billingEmail: 'billing@acme.com',
        admin: { email: 'other@acme.com', password: 'Senha123!' },
      })
    ).rejects.toThrow(SlugTakenError)
  })
})
```

- [ ] **Passo 2 — confirmar falha.** `pnpm --filter @wz/connect-backend test -- onboarding/service.test.ts` → FAIL (`Cannot find module './service.js'`).

- [ ] **Passo 3 — implementar:**

```ts
// apps/backend/src/onboarding/service.ts
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { organizations, users, memberships } from '../db/schema.js'
import { hashPassword } from '../auth/services/password.service.js'
import { createOrRotateSession } from '../auth/services/session.service.js'
import { issueCsrfToken } from '../auth/services/csrf.service.js'
import type { createTokenService } from '../auth/services/token.service.js'
import { SlugTakenError } from '../lib/errors.js'

export interface OnboardOrganizationInput {
  name: string
  slug: string
  cnpj?: string
  billingEmail: string
  admin: { email: string; password: string }
}

export async function onboardOrganization(
  db: Db,
  tokenService: ReturnType<typeof createTokenService>,
  input: OnboardOrganizationInput
): Promise<{ organizationId: string; userId: string; access: string; refresh: string; csrf: string }> {
  const [existing] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, input.slug))
    .limit(1)
  if (existing) {
    throw new SlugTakenError()
  }

  const passwordHash = await hashPassword(input.admin.password)

  const { organizationId, userId } = await db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({
        name: input.name,
        slug: input.slug,
        cnpj: input.cnpj,
        billingEmail: input.billingEmail,
      })
      .returning({ id: organizations.id })
    const [user] = await tx
      .insert(users)
      .values({ email: input.admin.email, passwordHash })
      .returning({ id: users.id })
    await tx
      .insert(memberships)
      .values({ userId: user.id, organizationId: org.id, role: 'owner', status: 'active' })
    return { organizationId: org.id, userId: user.id }
  })

  const { sessionId, refreshToken } = await createOrRotateSession(db, userId, organizationId)
  const access = await tokenService.signAccess({
    sub: userId,
    org: organizationId,
    role: 'owner',
    session: sessionId,
  })

  return { organizationId, userId, access, refresh: refreshToken, csrf: issueCsrfToken() }
}
```

- [ ] **Passo 4 — confirmar sucesso.** `pnpm --filter @wz/connect-backend test -- onboarding/service.test.ts` → PASS (2 testes).

- [ ] **Passo 5 — commit.**

```bash
git add apps/backend/src/onboarding/service.ts apps/backend/src/onboarding/service.test.ts
git commit -m "test+feat(backend): add onboardOrganization service"
```

---

### Tarefa 3: `onboarding/routes.ts`

**Arquivos:** Criar `apps/backend/src/onboarding/routes.ts` e `apps/backend/src/onboarding/routes.test.ts`.

**Interfaces:** Consome `onboardOrganization` (Tarefa 2), `setAuthCookies` (seção 3.2), `buildTestApp` (seção 3.5). Produz `registerOnboardingRoute(app: FastifyInstance, db: Db): Promise<void>` — monta `POST /api/v1/onboarding/organization`. Chamada a partir do domínio apex (nenhuma org existe ainda), que o plugin de tenancy já trata como `request.tenant = null` — não precisa mudar `publicPaths`.

- [ ] **Passo 1 — teste que falha:**

```ts
// apps/backend/src/onboarding/routes.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../db/client.js'
import { registerOnboardingRoute } from './routes.js'
import { buildTestApp } from '../test-utils/build-app.js'
import { env } from '../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, users, memberships CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

describe('POST /api/v1/onboarding/organization', () => {
  it('cria a organização e loga o admin: 201 + cookies', async () => {
    const app = await buildTestApp(db, (a) => registerOnboardingRoute(a, db))

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/organization',
      headers: { host: env.BASE_DOMAIN },
      payload: {
        name: 'Acme',
        slug: 'acme',
        billing_email: 'billing@acme.com',
        admin: { email: 'owner@acme.com', password: 'Senha123!' },
      },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().organizationId).toBeTruthy()
    expect(res.cookies.map((c) => c.name)).toEqual(
      expect.arrayContaining(['access_token', 'refresh_token', 'csrf'])
    )
    await app.close()
  })

  it('rejeita payload inválido com 400', async () => {
    const app = await buildTestApp(db, (a) => registerOnboardingRoute(a, db))
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/organization',
      headers: { host: env.BASE_DOMAIN },
      payload: { name: 'Acme' },
    })
    expect(res.statusCode).toBe(400)
    await app.close()
  })
})
```

- [ ] **Passo 2 — confirmar falha.** `pnpm --filter @wz/connect-backend test -- onboarding/routes.test.ts` → FAIL (`Cannot find module './routes.js'`).

- [ ] **Passo 3 — implementar:**

```ts
// apps/backend/src/onboarding/routes.ts
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../db/client.js'
import { createTokenService } from '../auth/services/token.service.js'
import { stubEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { setAuthCookies } from '../auth/lib/set-auth-cookies.js'
import { onboardOrganization } from './service.js'

const OnboardBody = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9-]+$/),
  cnpj: z.string().optional(),
  billing_email: z.string().email(),
  admin: z.object({ email: z.string().email(), password: z.string().min(8) }),
})

export async function registerOnboardingRoute(app: FastifyInstance, db: Db): Promise<void> {
  const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)

  app.post('/api/v1/onboarding/organization', async (request, reply) => {
    const parsed = OnboardBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
    }
    const result = await onboardOrganization(db, tokenService, {
      name: parsed.data.name,
      slug: parsed.data.slug,
      cnpj: parsed.data.cnpj,
      billingEmail: parsed.data.billing_email,
      admin: parsed.data.admin,
    })
    setAuthCookies(reply, { access: result.access, refresh: result.refresh, csrf: result.csrf })
    return reply.status(201).send({ organizationId: result.organizationId, userId: result.userId })
  })
}
```

- [ ] **Passo 4 — confirmar sucesso.** `pnpm --filter @wz/connect-backend test -- onboarding/routes.test.ts` → PASS (2 testes).

- [ ] **Passo 5 — commit.**

```bash
git add apps/backend/src/onboarding/routes.ts apps/backend/src/onboarding/routes.test.ts
git commit -m "test+feat(backend): add POST /onboarding/organization"
```

---

### Tarefa 4: `memberships/service.ts`

**Arquivos:** Criar `apps/backend/src/memberships/service.ts` e `apps/backend/src/memberships/service.test.ts`.

**Interfaces:** Consome `CrossOrgAccessError` (seção 3.1). Produz `interface MembershipRow { id: string; userId: string; organizationId: string; role: string; status: string; createdAt: Date }`, `listMemberships(db: Db, organizationId: string): Promise<MembershipRow[]>`, `createMembership(db: Db, organizationId: string, userId: string, role: string): Promise<MembershipRow>`, `updateMembershipRole(db: Db, organizationId: string, membershipId: string, role: string): Promise<MembershipRow>` (lança `CrossOrgAccessError` se a membership pertence a outra org). Consumida pela Tarefa 5.

- [ ] **Passo 1 — teste que falha:**

```ts
// apps/backend/src/memberships/service.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../db/client.js'
import { organizations, users, memberships } from '../db/schema.js'
import { listMemberships, createMembership, updateMembershipRole } from './service.js'
import { CrossOrgAccessError } from '../lib/errors.js'
import { env } from '../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, users, memberships CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

async function seedTwoOrgs() {
  const [orgA] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
  const [orgB] = await db.insert(organizations).values({ name: 'Beta', slug: 'beta' }).returning()
  const [userA] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
  const [membershipA] = await db
    .insert(memberships)
    .values({ userId: userA.id, organizationId: orgA.id, role: 'owner' })
    .returning()
  return { orgA, orgB, userA, membershipA }
}

describe('listMemberships', () => {
  it('lista só as memberships da organização informada', async () => {
    const { orgA, membershipA } = await seedTwoOrgs()
    const rows = await listMemberships(db, orgA.id)
    expect(rows.map((r) => r.id)).toEqual([membershipA.id])
  })
})

describe('createMembership', () => {
  it('cria uma membership ativa para um usuário existente', async () => {
    const { orgA } = await seedTwoOrgs()
    const [newUser] = await db.insert(users).values({ email: 'b@acme.com', passwordHash: 'x' }).returning()

    const membership = await createMembership(db, orgA.id, newUser.id, 'admin')

    expect(membership.role).toBe('admin')
    expect(membership.status).toBe('active')
  })
})

describe('updateMembershipRole', () => {
  it('atualiza o role quando a membership pertence à org informada', async () => {
    const { orgA, membershipA } = await seedTwoOrgs()
    const updated = await updateMembershipRole(db, orgA.id, membershipA.id, 'admin')
    expect(updated.role).toBe('admin')
  })

  it('lança CrossOrgAccessError quando a membership pertence a outra org', async () => {
    const { orgB, membershipA } = await seedTwoOrgs()
    await expect(updateMembershipRole(db, orgB.id, membershipA.id, 'admin')).rejects.toThrow(
      CrossOrgAccessError
    )
  })
})
```

- [ ] **Passo 2 — confirmar falha.** `pnpm --filter @wz/connect-backend test -- memberships/service.test.ts` → FAIL (`Cannot find module './service.js'`).

- [ ] **Passo 3 — implementar:**

```ts
// apps/backend/src/memberships/service.ts
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { memberships } from '../db/schema.js'
import { CrossOrgAccessError } from '../lib/errors.js'

export interface MembershipRow {
  id: string
  userId: string
  organizationId: string
  role: string
  status: string
  createdAt: Date
}

export async function listMemberships(db: Db, organizationId: string): Promise<MembershipRow[]> {
  return db.select().from(memberships).where(eq(memberships.organizationId, organizationId))
}

export async function createMembership(
  db: Db,
  organizationId: string,
  userId: string,
  role: string
): Promise<MembershipRow> {
  const [row] = await db
    .insert(memberships)
    .values({ organizationId, userId, role, status: 'active' })
    .returning()
  return row
}

export async function updateMembershipRole(
  db: Db,
  organizationId: string,
  membershipId: string,
  role: string
): Promise<MembershipRow> {
  const [existing] = await db.select().from(memberships).where(eq(memberships.id, membershipId)).limit(1)
  if (!existing || existing.organizationId !== organizationId) {
    throw new CrossOrgAccessError()
  }
  const [updated] = await db.update(memberships).set({ role }).where(eq(memberships.id, membershipId)).returning()
  return updated
}
```

- [ ] **Passo 4 — confirmar sucesso.** `pnpm --filter @wz/connect-backend test -- memberships/service.test.ts` → PASS (4 testes).

- [ ] **Passo 5 — commit.**

```bash
git add apps/backend/src/memberships/service.ts apps/backend/src/memberships/service.test.ts
git commit -m "test+feat(backend): add memberships service (list/create/update role)"
```

---

### Tarefa 5: `memberships/routes.ts`

**Arquivos:** Criar `apps/backend/src/memberships/routes.ts` e `apps/backend/src/memberships/routes.test.ts`.

**Interfaces:** Consome `listMemberships`/`createMembership`/`updateMembershipRole` (Tarefa 4), `createRequireAuth`/`requireRole` (seção 3.3), `NotAMemberError` (seção 3.1). Produz `registerMembershipsRoutes(app: FastifyInstance, db: Db): Promise<void>` — monta `GET/POST /api/v1/memberships`, `PUT /api/v1/memberships/:id`.

- [ ] **Passo 1 — teste que falha:**

```ts
// apps/backend/src/memberships/routes.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../db/client.js'
import { organizations, users, memberships } from '../db/schema.js'
import { createOrRotateSession } from '../auth/services/session.service.js'
import { createTokenService } from '../auth/services/token.service.js'
import { stubEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { registerMembershipsRoutes } from './routes.js'
import { buildTestApp } from '../test-utils/build-app.js'
import { env } from '../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, users, memberships, sessions CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

async function seedOwnerSession(role = 'owner') {
  const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
  const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
  const [membership] = await db.insert(memberships).values({ userId: user.id, organizationId: org.id, role }).returning()
  const { sessionId } = await createOrRotateSession(db, user.id, org.id)
  return { org, user, membership, sessionId }
}

describe('memberships routes', () => {
  it('GET /memberships lista as memberships da org do token', async () => {
    const { org, sessionId, user } = await seedOwnerSession()
    const app = await buildTestApp(db, (a) => registerMembershipsRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/memberships',
      headers: { host: 'acme.wz-hub.com' },
      cookies: { access_token: access },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
    await app.close()
  })

  it('POST /memberships cria uma membership quando o requester é owner/admin', async () => {
    const { org, sessionId, user } = await seedOwnerSession()
    const [newUser] = await db.insert(users).values({ email: 'b@acme.com', passwordHash: 'x' }).returning()
    const app = await buildTestApp(db, (a) => registerMembershipsRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/memberships',
      headers: { host: 'acme.wz-hub.com' },
      cookies: { access_token: access },
      payload: { userId: newUser.id, role: 'viewer' },
    })

    expect(res.statusCode).toBe(201)
    await app.close()
  })

  it('POST /memberships rejeita com 403 quando o requester não é owner/admin', async () => {
    const { org, sessionId, user } = await seedOwnerSession('viewer')
    const [newUser] = await db.insert(users).values({ email: 'b@acme.com', passwordHash: 'x' }).returning()
    const app = await buildTestApp(db, (a) => registerMembershipsRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'viewer', session: sessionId })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/memberships',
      headers: { host: 'acme.wz-hub.com' },
      cookies: { access_token: access },
      payload: { userId: newUser.id, role: 'viewer' },
    })

    expect(res.statusCode).toBe(403)
    await app.close()
  })

  it('PUT /memberships/:id muda o role', async () => {
    const { org, sessionId, user, membership } = await seedOwnerSession()
    const app = await buildTestApp(db, (a) => registerMembershipsRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/memberships/${membership.id}`,
      headers: { host: 'acme.wz-hub.com' },
      cookies: { access_token: access },
      payload: { role: 'admin' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().role).toBe('admin')
    await app.close()
  })
})
```

- [ ] **Passo 2 — confirmar falha.** `pnpm --filter @wz/connect-backend test -- memberships/routes.test.ts` → FAIL (`Cannot find module './routes.js'`).

- [ ] **Passo 3 — implementar:**

```ts
// apps/backend/src/memberships/routes.ts
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../db/client.js'
import { createRequireAuth } from '../auth/hooks/require-auth.js'
import { requireRole } from '../auth/hooks/require-role.js'
import { stubEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { listMemberships, createMembership, updateMembershipRole } from './service.js'
import { NotAMemberError } from '../lib/errors.js'

const RoleEnum = z.enum(['owner', 'admin', 'manager', 'operator', 'viewer'])
const CreateMembershipBody = z.object({ userId: z.string().uuid(), role: RoleEnum })
const UpdateMembershipBody = z.object({ role: RoleEnum })

export async function registerMembershipsRoutes(app: FastifyInstance, db: Db): Promise<void> {
  const requireAuth = createRequireAuth(db, app.jwt, stubEntitlementsResolver)
  const requireOwnerOrAdmin = requireRole('owner', 'admin')

  app.get('/api/v1/memberships', { preHandler: requireAuth }, async (request) => {
    if (!request.tenant) {
      throw new NotAMemberError()
    }
    return listMemberships(db, request.tenant.id)
  })

  app.post(
    '/api/v1/memberships',
    { preHandler: [requireAuth, requireOwnerOrAdmin] },
    async (request, reply) => {
      if (!request.tenant) {
        throw new NotAMemberError()
      }
      const parsed = CreateMembershipBody.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
      }
      const membership = await createMembership(db, request.tenant.id, parsed.data.userId, parsed.data.role)
      return reply.status(201).send(membership)
    }
  )

  app.put<{ Params: { id: string } }>(
    '/api/v1/memberships/:id',
    { preHandler: [requireAuth, requireOwnerOrAdmin] },
    async (request, reply) => {
      if (!request.tenant) {
        throw new NotAMemberError()
      }
      const parsed = UpdateMembershipBody.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
      }
      const membership = await updateMembershipRole(db, request.tenant.id, request.params.id, parsed.data.role)
      return reply.send(membership)
    }
  )
}
```

- [ ] **Passo 4 — confirmar sucesso.** `pnpm --filter @wz/connect-backend test -- memberships/routes.test.ts` → PASS (4 testes).

- [ ] **Passo 5 — commit.**

```bash
git add apps/backend/src/memberships/routes.ts apps/backend/src/memberships/routes.test.ts
git commit -m "test+feat(backend): add GET/POST /memberships and PUT /memberships/:id"
```

---

### Tarefa 6: `invites/service.ts`

**Arquivos:** Criar `apps/backend/src/invites/service.ts` e `apps/backend/src/invites/service.test.ts`.

**Interfaces:** Consome `generateRefreshToken` (seção 3.2, reaproveitado como gerador de token opaco genérico), `hashPassword`, `createOrRotateSession`, `issueCsrfToken`, `createTokenService` (seção 3.2), `InviteInvalidError`/`InviteEmailMismatchError` (Tarefa 1), `AppError` (usado diretamente para o caso pontual "senha obrigatória" — não vale a pena uma subclasse dedicada para algo tão específico). Produz `createInvite(db: Db, organizationId: string, email: string, role: string): Promise<{ token: string }>`, `previewInvite(db: Db, token: string): Promise<{ organizationName: string; role: string; expired: boolean }>`, `interface AcceptInviteInput { authedUserEmail?: string; password?: string }`, `acceptInvite(db: Db, tokenService, token: string, input: AcceptInviteInput): Promise<{ organizationId: string; userId: string; role: string; access: string; refresh: string; csrf: string }>`. Consumida pela Tarefa 7.

- [ ] **Passo 1 — teste que falha:**

```ts
// apps/backend/src/invites/service.test.ts
import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { sql, eq } from 'drizzle-orm'
import Fastify, { type FastifyInstance } from 'fastify'
import fastifyJwt from '@fastify/jwt'
import { createDb, type Db } from '../db/client.js'
import { organizations, users, memberships, invites } from '../db/schema.js'
import { createInvite, previewInvite, acceptInvite } from './service.js'
import { createTokenService } from '../auth/services/token.service.js'
import { stubEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { InviteInvalidError, InviteEmailMismatchError } from '../lib/errors.js'
import { AppError } from '../lib/errors.js'
import { env } from '../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']
let app: FastifyInstance

beforeAll(async () => {
  app = Fastify()
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { algorithm: 'HS256', expiresIn: '15m' },
    verify: { algorithms: ['HS256'] },
  })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await pool.end()
})

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, users, memberships, invites CASCADE`)
})

async function seedOrg() {
  const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
  return org
}

describe('createInvite', () => {
  it('cria a linha em invites e, se o e-mail já é um usuário existente, cria a membership com status invited', async () => {
    const org = await seedOrg()
    const [user] = await db.insert(users).values({ email: 'existing@acme.com', passwordHash: 'x' }).returning()

    const { token } = await createInvite(db, org.id, 'existing@acme.com', 'admin')

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const [membership] = await db.select().from(memberships).where(eq(memberships.userId, user.id))
    expect(membership.status).toBe('invited')
    expect(membership.role).toBe('admin')
  })

  it('não cria membership quando o e-mail é novo', async () => {
    const org = await seedOrg()
    await createInvite(db, org.id, 'novo@acme.com', 'viewer')
    const rows = await db.select().from(memberships)
    expect(rows).toHaveLength(0)
  })
})

describe('previewInvite', () => {
  it('retorna organizationName, role e expired=false para um convite válido', async () => {
    const org = await seedOrg()
    const { token } = await createInvite(db, org.id, 'novo@acme.com', 'viewer')
    const preview = await previewInvite(db, token)
    expect(preview).toEqual({ organizationName: 'Acme', role: 'viewer', expired: false })
  })

  it('lança InviteInvalidError para um token que não existe', async () => {
    await expect(previewInvite(db, 'token-inexistente')).rejects.toThrow(InviteInvalidError)
  })
})

describe('acceptInvite', () => {
  it('caso usuário novo: cria o user com a senha informada e loga', async () => {
    const org = await seedOrg()
    const { token } = await createInvite(db, org.id, 'novo@acme.com', 'viewer')
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)

    const result = await acceptInvite(db, tokenService, token, { password: 'Senha123!' })

    expect(result.organizationId).toBe(org.id)
    expect(result.role).toBe('viewer')
    const [membership] = await db.select().from(memberships).where(eq(memberships.userId, result.userId))
    expect(membership.status).toBe('active')
  })

  it('caso usuário novo sem senha: lança AppError 400', async () => {
    const org = await seedOrg()
    const { token } = await createInvite(db, org.id, 'novo@acme.com', 'viewer')
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)

    await expect(acceptInvite(db, tokenService, token, {})).rejects.toThrow(AppError)
  })

  it('caso usuário existente: ativa a membership quando o e-mail autenticado confere', async () => {
    const org = await seedOrg()
    const [user] = await db.insert(users).values({ email: 'existing@acme.com', passwordHash: 'x' }).returning()
    const { token } = await createInvite(db, org.id, 'existing@acme.com', 'admin')
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)

    const result = await acceptInvite(db, tokenService, token, { authedUserEmail: 'existing@acme.com' })

    expect(result.userId).toBe(user.id)
    const [membership] = await db.select().from(memberships).where(eq(memberships.userId, user.id))
    expect(membership.status).toBe('active')
  })

  it('caso usuário existente: lança InviteEmailMismatchError quando o e-mail autenticado diverge', async () => {
    const org = await seedOrg()
    await db.insert(users).values({ email: 'existing@acme.com', passwordHash: 'x' })
    const { token } = await createInvite(db, org.id, 'existing@acme.com', 'admin')
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)

    await expect(
      acceptInvite(db, tokenService, token, { authedUserEmail: 'outro@acme.com' })
    ).rejects.toThrow(InviteEmailMismatchError)
  })

  it('lança InviteInvalidError para um token que não existe', async () => {
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    await expect(acceptInvite(db, tokenService, 'token-inexistente', {})).rejects.toThrow(InviteInvalidError)
  })
})
```

- [ ] **Passo 2 — confirmar falha.** `pnpm --filter @wz/connect-backend test -- invites/service.test.ts` → FAIL (`Cannot find module './service.js'`).

- [ ] **Passo 3 — implementar:**

```ts
// apps/backend/src/invites/service.ts
import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { invites, memberships, users, organizations } from '../db/schema.js'
import { generateRefreshToken } from '../auth/lib/refresh-token.js'
import { hashPassword } from '../auth/services/password.service.js'
import { createOrRotateSession } from '../auth/services/session.service.js'
import { issueCsrfToken } from '../auth/services/csrf.service.js'
import type { createTokenService } from '../auth/services/token.service.js'
import { AppError, InviteInvalidError, InviteEmailMismatchError } from '../lib/errors.js'

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export async function createInvite(
  db: Db,
  organizationId: string,
  email: string,
  role: string
): Promise<{ token: string }> {
  const token = generateRefreshToken()
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS)

  await db.transaction(async (tx) => {
    await tx.insert(invites).values({ organizationId, email, role, token, expiresAt })

    const [existingUser] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
    if (existingUser) {
      await tx.insert(memberships).values({
        userId: existingUser.id,
        organizationId,
        role,
        status: 'invited',
      })
    }
  })

  return { token }
}

export async function previewInvite(
  db: Db,
  token: string
): Promise<{ organizationName: string; role: string; expired: boolean }> {
  const [row] = await db
    .select({
      organizationName: organizations.name,
      role: invites.role,
      expired: sql<boolean>`${invites.expiresAt} < now()`,
    })
    .from(invites)
    .innerJoin(organizations, eq(invites.organizationId, organizations.id))
    .where(eq(invites.token, token))
    .limit(1)
  if (!row) {
    throw new InviteInvalidError()
  }
  return row
}

export interface AcceptInviteInput {
  authedUserEmail?: string
  password?: string
}

export async function acceptInvite(
  db: Db,
  tokenService: ReturnType<typeof createTokenService>,
  token: string,
  input: AcceptInviteInput
): Promise<{
  organizationId: string
  userId: string
  role: string
  access: string
  refresh: string
  csrf: string
}> {
  const [invite] = await db
    .select({
      id: invites.id,
      organizationId: invites.organizationId,
      email: invites.email,
      role: invites.role,
      expired: sql<boolean>`${invites.expiresAt} < now()`,
    })
    .from(invites)
    .where(eq(invites.token, token))
    .limit(1)

  if (!invite || invite.expired) {
    throw new InviteInvalidError()
  }

  const [existingUser] = await db.select().from(users).where(eq(users.email, invite.email)).limit(1)

  let userId: string
  if (existingUser) {
    if (!input.authedUserEmail || input.authedUserEmail !== invite.email) {
      throw new InviteEmailMismatchError()
    }
    userId = existingUser.id
    await db.transaction(async (tx) => {
      await tx
        .update(memberships)
        .set({ status: 'active' })
        .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, invite.organizationId)))
      await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id))
    })
  } else {
    if (!input.password) {
      throw new AppError('password-required', 400, 'Senha é obrigatória para aceitar este convite')
    }
    const passwordHash = await hashPassword(input.password)
    userId = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: invite.email, passwordHash })
        .returning({ id: users.id })
      await tx.insert(memberships).values({
        userId: user.id,
        organizationId: invite.organizationId,
        role: invite.role,
        status: 'active',
      })
      await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id))
      return user.id
    })
  }

  const { sessionId, refreshToken } = await createOrRotateSession(db, userId, invite.organizationId)
  const access = await tokenService.signAccess({
    sub: userId,
    org: invite.organizationId,
    role: invite.role,
    session: sessionId,
  })

  return {
    organizationId: invite.organizationId,
    userId,
    role: invite.role,
    access,
    refresh: refreshToken,
    csrf: issueCsrfToken(),
  }
}
```

- [ ] **Passo 4 — confirmar sucesso.** `pnpm --filter @wz/connect-backend test -- invites/service.test.ts` → PASS (8 testes).

- [ ] **Passo 5 — commit.**

```bash
git add apps/backend/src/invites/service.ts apps/backend/src/invites/service.test.ts
git commit -m "test+feat(backend): add invites service (create/preview/accept)"
```

---

### Tarefa 7: `invites/routes.ts`

**Arquivos:** Criar `apps/backend/src/invites/routes.ts` e `apps/backend/src/invites/routes.test.ts`.

**Interfaces:** Consome `createInvite`/`previewInvite`/`acceptInvite` (Tarefa 6), `createRequireAuth`/`requireRole` (seção 3.3), `setAuthCookies` (seção 3.2), `createTokenService` (seção 3.2). Produz `registerInvitesRoutes(app: FastifyInstance, db: Db): Promise<void>` — monta `POST /api/v1/invites` (autenticado, owner/admin), `GET /api/v1/invites/:token` (preview anônimo), `POST /api/v1/invites/:token/accept` (funciona anônimo — usuário novo + senha — e autenticado — usuário existente).

- [ ] **Passo 1 — teste que falha:**

```ts
// apps/backend/src/invites/routes.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, eq } from 'drizzle-orm'
import { createDb, type Db } from '../db/client.js'
import { organizations, users, memberships } from '../db/schema.js'
import { createOrRotateSession } from '../auth/services/session.service.js'
import { createTokenService } from '../auth/services/token.service.js'
import { stubEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { createInvite } from './service.js'
import { registerInvitesRoutes } from './routes.js'
import { buildTestApp } from '../test-utils/build-app.js'
import { env } from '../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, users, memberships, invites, sessions CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

describe('invites routes', () => {
  it('POST /invites cria um convite quando o requester é owner/admin', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [owner] = await db.insert(users).values({ email: 'owner@acme.com', passwordHash: 'x' }).returning()
    await db.insert(memberships).values({ userId: owner.id, organizationId: org.id, role: 'owner' })
    const { sessionId } = await createOrRotateSession(db, owner.id, org.id)

    const app = await buildTestApp(db, (a) => registerInvitesRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: owner.id, org: org.id, role: 'owner', session: sessionId })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/invites',
      headers: { host: 'acme.wz-hub.com' },
      cookies: { access_token: access },
      payload: { email: 'novo@acme.com', role: 'viewer' },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().token).toBeTruthy()
    await app.close()
  })

  it('GET /invites/:token retorna o preview sem autenticação', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const { token } = await createInvite(db, org.id, 'novo@acme.com', 'viewer')
    const app = await buildTestApp(db, (a) => registerInvitesRoutes(a, db))

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/invites/${token}`,
      headers: { host: env.BASE_DOMAIN },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ organizationName: 'Acme', role: 'viewer', expired: false })
    await app.close()
  })

  it('POST /invites/:token/accept cria o usuário novo e loga (fluxo anônimo)', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const { token } = await createInvite(db, org.id, 'novo@acme.com', 'viewer')
    const app = await buildTestApp(db, (a) => registerInvitesRoutes(a, db))

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/invites/${token}/accept`,
      headers: { host: env.BASE_DOMAIN },
      payload: { password: 'Senha123!' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.cookies.map((c) => c.name)).toEqual(
      expect.arrayContaining(['access_token', 'refresh_token', 'csrf'])
    )
    await app.close()
  })

  it('POST /invites/:token/accept ativa a membership existente quando logado com o e-mail certo', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [existingUser] = await db
      .insert(users)
      .values({ email: 'existing@acme.com', passwordHash: 'x' })
      .returning()
    const { token } = await createInvite(db, org.id, 'existing@acme.com', 'admin')

    // A sessão usada aqui é de outra org (hub-less), só para autenticar o
    // usuário; o accept resolve a organização a partir do próprio convite.
    const { sessionId } = await createOrRotateSession(db, existingUser.id, null)
    const app = await buildTestApp(db, (a) => registerInvitesRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({
      sub: existingUser.id,
      org: null,
      role: 'super_admin',
      session: sessionId,
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/invites/${token}/accept`,
      headers: { host: env.BASE_DOMAIN },
      cookies: { access_token: access },
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    const [membership] = await db.select().from(memberships).where(eq(memberships.userId, existingUser.id))
    expect(membership.status).toBe('active')
    await app.close()
  })
})
```

- [ ] **Passo 2 — confirmar falha.** `pnpm --filter @wz/connect-backend test -- invites/routes.test.ts` → FAIL (`Cannot find module './routes.js'`).

- [ ] **Passo 3 — implementar:**

```ts
// apps/backend/src/invites/routes.ts
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { users } from '../db/schema.js'
import { createRequireAuth } from '../auth/hooks/require-auth.js'
import { requireRole } from '../auth/hooks/require-role.js'
import { createTokenService } from '../auth/services/token.service.js'
import { stubEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { setAuthCookies } from '../auth/lib/set-auth-cookies.js'
import { createInvite, previewInvite, acceptInvite } from './service.js'
import { NotAMemberError } from '../lib/errors.js'

const RoleEnum = z.enum(['owner', 'admin', 'manager', 'operator', 'viewer'])
const CreateInviteBody = z.object({ email: z.string().email(), role: RoleEnum })
const AcceptInviteBody = z.object({ password: z.string().min(8).optional() })

export async function registerInvitesRoutes(app: FastifyInstance, db: Db): Promise<void> {
  const requireAuth = createRequireAuth(db, app.jwt, stubEntitlementsResolver)
  const requireOwnerOrAdmin = requireRole('owner', 'admin')
  const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)

  app.post(
    '/api/v1/invites',
    { preHandler: [requireAuth, requireOwnerOrAdmin] },
    async (request, reply) => {
      if (!request.tenant) {
        throw new NotAMemberError()
      }
      const parsed = CreateInviteBody.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
      }
      const { token } = await createInvite(db, request.tenant.id, parsed.data.email, parsed.data.role)
      return reply.status(201).send({ token })
    }
  )

  app.get<{ Params: { token: string } }>('/api/v1/invites/:token', async (request) => {
    return previewInvite(db, request.params.token)
  })

  app.post<{ Params: { token: string } }>('/api/v1/invites/:token/accept', async (request, reply) => {
    const parsed = AcceptInviteBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
    }

    let authedUserEmail: string | undefined
    const cookieToken = request.cookies.access_token
    if (cookieToken) {
      try {
        const payload = tokenService.verifyAccess(cookieToken)
        const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, payload.sub)).limit(1)
        authedUserEmail = user?.email
      } catch {
        // token ausente/expirado/inválido — tratado como aceite anônimo
      }
    }

    const result = await acceptInvite(db, tokenService, request.params.token, {
      authedUserEmail,
      password: parsed.data.password,
    })
    setAuthCookies(reply, { access: result.access, refresh: result.refresh, csrf: result.csrf })
    return reply.send({ organizationId: result.organizationId, userId: result.userId, role: result.role })
  })
}
```

- [ ] **Passo 4 — confirmar sucesso.** `pnpm --filter @wz/connect-backend test -- invites/routes.test.ts` → PASS (4 testes).

- [ ] **Passo 5 — commit.**

```bash
git add apps/backend/src/invites/routes.ts apps/backend/src/invites/routes.test.ts
git commit -m "test+feat(backend): add POST /invites, GET /invites/:token, POST /invites/:token/accept"
```

---

### Tarefa 8: Wiring em `server.ts`

**Arquivos:** Modificar `apps/backend/src/server.ts`.

**Interfaces:** Consome `registerOnboardingRoute` (Tarefa 3), `registerMembershipsRoutes` (Tarefa 5), `registerInvitesRoutes` (Tarefa 7).

Não é TDD — wiring do composition-root, mesmo padrão do Plano 3 Tarefa 9. Verificado pela rodada de suíte completa da Tarefa 9 e pelo smoke test manual da Tarefa 10.

- [ ] **Passo 1 — adicionar os três imports e chamadas de registro.** No bloco de imports de `apps/backend/src/server.ts`:

```ts
import { registerOnboardingRoute } from './onboarding/routes.js'
import { registerMembershipsRoutes } from './memberships/routes.js'
import { registerInvitesRoutes } from './invites/routes.js'
```

E depois da linha existente `await registerMfaRoutes(app, db)`, adicionar:

```ts
await registerOnboardingRoute(app, db)
await registerMembershipsRoutes(app, db)
await registerInvitesRoutes(app, db)
```

- [ ] **Passo 2 — type-check e build.** `pnpm --filter @wz/connect-backend build` → sem erros de TypeScript.

- [ ] **Passo 3 — commit.**

```bash
git add apps/backend/src/server.ts
git commit -m "feat(backend): wire onboarding, memberships and invites routes into server.ts"
```

---

### Tarefa 9: Suíte completa + checagem de cobertura

- [ ] **Passo 1 — confirmar Postgres no ar.** `docker compose up -d postgres` (a partir de `wz-connect/`).
- [ ] **Passo 2 — rodar a suíte completa do backend com cobertura.** `pnpm --filter @wz/connect-backend test:coverage` → todos os arquivos de teste dos Planos 1–4 passam; cobertura ≥85%.
- [ ] **Passo 3 — se algum threshold ficar abaixo de 85%, adicionar o(s) caso(s) de teste faltante(s), red→green, e rodar de novo.**
- [ ] **Passo 4 — commit se algum arquivo de teste foi tocado no Passo 3.**

```bash
git add apps/backend/src
git commit -m "test(backend): close coverage gaps found by full-suite run (Plan 4)"
```

---

### Tarefa 10: Smoke test manual — onboarding → invite → accept

- [ ] **Passo 1 — subir o servidor real.** A partir de `wz-connect/`: `docker compose up -d postgres`. A partir de `apps/backend/`: `pnpm dev`.

- [ ] **Passo 2 — onboardar uma nova organização:**

```bash
curl -i -c /tmp/wzcookies.txt -H "Host: localhost" -H "Content-Type: application/json" \
  -X POST http://localhost:3000/api/v1/onboarding/organization \
  -d '{"name":"Beta","slug":"beta","billing_email":"billing@beta.com","admin":{"email":"owner@beta.com","password":"Senha123!"}}'
```

Esperado: `201`, corpo com `organizationId` e `userId`, cookies setados (owner já logado).

- [ ] **Passo 3 — convidar um colega:**

```bash
curl -s -b /tmp/wzcookies.txt -H "Host: beta.localhost" -H "Content-Type: application/json" \
  -X POST http://localhost:3000/api/v1/invites \
  -d '{"email":"colega@beta.com","role":"viewer"}'
```

Esperado: `{"token":"..."}`. Copiar o token como `INVITE_TOKEN`.

- [ ] **Passo 4 — preview do convite anônimo:**

```bash
curl -s -H "Host: localhost" http://localhost:3000/api/v1/invites/INVITE_TOKEN
```

Esperado: `{"organizationName":"Beta","role":"viewer","expired":false}`.

- [ ] **Passo 5 — aceitar o convite como usuário novo:**

```bash
curl -i -c /tmp/wzcookies2.txt -H "Host: localhost" -H "Content-Type: application/json" \
  -X POST http://localhost:3000/api/v1/invites/INVITE_TOKEN/accept \
  -d '{"password":"OutraSenha123!"}'
```

Esperado: `200`, cookies setados para o novo colega.

- [ ] **Passo 6 — confirmar que o novo colega aparece na lista de membros da org:**

```bash
curl -s -b /tmp/wzcookies.txt -H "Host: beta.localhost" http://localhost:3000/api/v1/memberships
```

Esperado: um array com duas entradas — o owner e o `colega@beta.com` recém-aceito, ambos com `status: "active"`.

- [ ] **Passo 7 — parar o servidor dev e limpar.** Ctrl+C no servidor dev; `rm -f /tmp/wzcookies.txt /tmp/wzcookies2.txt`.

Sem commit nesta tarefa — é verificação. Se algum passo não bater com o esperado, é bug: red→green no service/route de teste relevante, depois rodar esta tarefa de novo.

## 6. Definição de pronto

- Todos os checkboxes das Tarefas 1–10 marcados.
- `pnpm --filter @wz/connect-backend test:coverage` verde, cobertura ≥85%.
- `pnpm --filter @wz/connect-backend build` sem erros de TypeScript.
- Smoke test manual (Tarefa 10) passa de ponta a ponta: onboard → invite → preview → accept → lista de membros mostra os dois.
- Branch de trabalho: `feature/auth-tenancy-core` (mesma dos Planos 1–3), publicada em `origin` a cada tarefa via `git push` incremental (ou ao final, conforme preferência de quem executa).
