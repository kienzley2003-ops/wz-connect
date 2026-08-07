# Auth Routes & Server Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the login → MFA → refresh → logout HTTP flow on top of Plan 2's services, then prove it works with a real `curl` session against the real backend.

**Architecture:** Route handlers stay thin — Zod validation, call a service, translate the result into cookies/JSON. Two small new services (`login.service.ts`, two `session.service.ts` additions) hold logic shared between `login.ts` and `mfa-challenge.ts` so it's written and tested once. **This is Plan 3 of the Frente A sequence** — the terminal plan for "can I actually log in." Plan 1 = primitives, Plan 2 = session/token/tenancy infra (both merged into `feature/auth-tenancy-core`, 93 tests, 99.31% coverage).

**Tech Stack:** Fastify 5, `@fastify/helmet`, `@fastify/cors` (already added to `package.json` in Plan 2, unused until now), Zod, Vitest 2.x + real Postgres (file parallelism disabled — see Plan 2's `vitest.config.ts` note).

## Global Constraints

- TDD required for every task (user's standing instruction).
- Coverage ≥85% — spec §7.
- Relative imports use `.js` (NodeNext).
- Session is created **only after MFA is confirmed** when `mfa_enabled = true` — never before (spec §4.1's security note: creating the session early would let a password-only attacker revoke the legitimate session without ever completing MFA).
- CSRF (double-submit): required on every mutating auth endpoint **except** `/auth/login` and `/auth/mfa` (no csrf cookie exists yet at that point) — ADR-0004.
- Refresh token rotates on every use; the **session itself does not rotate** on refresh (only on login) — only the opaque refresh token value and its DB row change.
- Rate limit: 10/min on `/auth/login` specifically (global is already 200/min) — ADR-0012.
- Integration tests: real Postgres via `docker compose up -d postgres` + `pnpm --filter @wz/connect-backend db:migrate` (already applied by Plan 2) — TRUNCATE-based, file-parallelism disabled.
- Every task ends with a commit.

---

## Task 1: `session.service.ts` — `revokeSession` and `rotateRefreshToken`

**Files:**
- Modify: `apps/backend/src/auth/services/session.service.ts` (add two exports; `REFRESH_TTL_MS` already defined at the top of this file from Plan 2)
- Modify: `apps/backend/src/auth/services/session.service.test.ts` (append tests)

**Interfaces:**
- Consumes: `Db`, `sessions`/`refreshTokens` tables, `generateRefreshToken`/`hashRefreshToken` (all already imported in this file).
- Produces: `revokeSession(db: Db, sessionId: string): Promise<void>` — revokes the session row and any still-active refresh token for it (used by logout and by refresh's replay-detection). `rotateRefreshToken(db: Db, sessionId: string, userId: string): Promise<string>` — revokes the session's active refresh token and mints a new one **without touching the session row**; returns the new plain refresh token. Task 5 (`refresh.ts`) and Task 6 (`logout.ts`) call these.

- [ ] **Step 1: Write the failing tests**

Append to `session.service.test.ts`:

```ts
import { revokeSession, rotateRefreshToken } from './session.service.js'
```

```ts
describe('revokeSession', () => {
  it('revoga a sessão e seu refresh token ativo', async () => {
    const { org, user } = await seedUserAndOrg()
    const { sessionId } = await createOrRotateSession(db, user.id, org.id)

    await revokeSession(db, sessionId)

    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId))
    expect(session.revokedAt).not.toBeNull()
    const [refresh] = await db.select().from(refreshTokens).where(eq(refreshTokens.sessionId, sessionId))
    expect(refresh.revokedAt).not.toBeNull()
  })
})

describe('rotateRefreshToken', () => {
  it('revoga o refresh token antigo e cria um novo para a mesma sessão, sem revogar a sessão', async () => {
    const { org, user } = await seedUserAndOrg()
    const { sessionId, refreshToken: oldToken } = await createOrRotateSession(db, user.id, org.id)

    const newToken = await rotateRefreshToken(db, sessionId, user.id)

    expect(newToken).not.toBe(oldToken)
    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId))
    expect(session.revokedAt).toBeNull()

    const rows = await db.select().from(refreshTokens).where(eq(refreshTokens.sessionId, sessionId))
    const active = rows.filter((r) => r.revokedAt === null)
    expect(active).toHaveLength(1)
    expect(active[0].tokenHash).toBe(hashRefreshToken(newToken))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- session.service.test.ts`
Expected: FAIL — `revokeSession`/`rotateRefreshToken` are not exported

- [ ] **Step 3: Implement**

Append to `session.service.ts`:

```ts
export async function revokeSession(db: Db, sessionId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId))
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.sessionId, sessionId), isNull(refreshTokens.revokedAt)))
  })
}

export async function rotateRefreshToken(db: Db, sessionId: string, userId: string): Promise<string> {
  return db.transaction(async (tx) => {
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.sessionId, sessionId), isNull(refreshTokens.revokedAt)))

    const refreshTokenPlain = generateRefreshToken()
    await tx.insert(refreshTokens).values({
      userId,
      sessionId,
      tokenHash: hashRefreshToken(refreshTokenPlain),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    })
    return refreshTokenPlain
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- session.service.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/auth/services/session.service.ts apps/backend/src/auth/services/session.service.test.ts
git commit -m "test+feat(backend): add revokeSession and rotateRefreshToken"
```

---

## Task 2: `login.service.ts` + `set-auth-cookies.ts`

**Files:**
- Create: `apps/backend/src/auth/services/login.service.ts`
- Test: `apps/backend/src/auth/services/login.service.test.ts`
- Create: `apps/backend/src/auth/lib/set-auth-cookies.ts`
- Test: `apps/backend/src/auth/lib/set-auth-cookies.test.ts`

**Interfaces:**
- Consumes: `createOrRotateSession` (`./session.service.js`), `createTokenService`/`JwtSigner` (`./token.service.js`), `issueCsrfToken` (`./csrf.service.js`), `NotAMemberError` (`../../lib/errors.js`), `users`/`memberships` tables.
- Produces: `resolveRole(db: Db, userId: string, organizationId: string | null): Promise<string>` — `'super_admin'` if `organizationId` is `null` and the user has `isSuperAdmin`, else the membership's `role`; throws `NotAMemberError` otherwise. `completeLogin(db: Db, tokenService, userId: string, organizationId: string | null, role: string): Promise<{ access: string; refresh: string; csrf: string }>`. `setAuthCookies(reply: FastifyReply, tokens: { access; refresh; csrf }): void` and `clearAuthCookies(reply: FastifyReply): void`. Tasks 3–7 (all routes) call these.

- [ ] **Step 1: Write the failing tests for `login.service.ts`**

```ts
// apps/backend/src/auth/services/login.service.test.ts
import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { sql } from 'drizzle-orm'
import Fastify, { type FastifyInstance } from 'fastify'
import fastifyJwt from '@fastify/jwt'
import { createDb, type Db } from '../../db/client.js'
import { organizations, users, memberships } from '../../db/schema.js'
import { resolveRole, completeLogin } from './login.service.js'
import { createTokenService } from './token.service.js'
import { stubEntitlementsResolver } from './entitlements.service.js'
import { NotAMemberError } from '../../lib/errors.js'
import { env } from '../../env.js'

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

describe('resolveRole', () => {
  it('retorna o role da membership quando organizationId é fornecido', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
    await db.insert(memberships).values({ userId: user.id, organizationId: org.id, role: 'admin' })

    expect(await resolveRole(db, user.id, org.id)).toBe('admin')
  })

  it('lança NotAMemberError quando o usuário não tem membership na org', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
    await expect(resolveRole(db, user.id, org.id)).rejects.toThrow(NotAMemberError)
  })

  it('retorna super_admin quando organizationId é null e o usuário é super_admin', async () => {
    const [user] = await db
      .insert(users)
      .values({ email: 'root@hub.com', passwordHash: 'x', isSuperAdmin: true })
      .returning()
    expect(await resolveRole(db, user.id, null)).toBe('super_admin')
  })

  it('lança NotAMemberError quando organizationId é null e o usuário não é super_admin', async () => {
    const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
    await expect(resolveRole(db, user.id, null)).rejects.toThrow(NotAMemberError)
  })
})

describe('completeLogin', () => {
  it('cria sessão, assina access token e emite csrf', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)

    const tokens = await completeLogin(db, tokenService, user.id, org.id, 'owner')

    expect(tokenService.verifyAccess(tokens.access).sub).toBe(user.id)
    expect(tokens.refresh).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(tokens.csrf.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- login.service.test.ts`
Expected: FAIL — `Cannot find module './login.service.js'`

- [ ] **Step 3: Implement `login.service.ts`**

```ts
// apps/backend/src/auth/services/login.service.ts
import { and, eq } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { users, memberships } from '../../db/schema.js'
import { createOrRotateSession } from './session.service.js'
import type { createTokenService } from './token.service.js'
import { issueCsrfToken } from './csrf.service.js'
import { NotAMemberError } from '../../lib/errors.js'

export async function resolveRole(
  db: Db,
  userId: string,
  organizationId: string | null
): Promise<string> {
  if (organizationId === null) {
    const [user] = await db
      .select({ isSuperAdmin: users.isSuperAdmin })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    if (!user?.isSuperAdmin) {
      throw new NotAMemberError()
    }
    return 'super_admin'
  }

  const [membership] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)))
    .limit(1)
  if (!membership) {
    throw new NotAMemberError()
  }
  return membership.role
}

export async function completeLogin(
  db: Db,
  tokenService: ReturnType<typeof createTokenService>,
  userId: string,
  organizationId: string | null,
  role: string
): Promise<{ access: string; refresh: string; csrf: string }> {
  const { sessionId, refreshToken } = await createOrRotateSession(db, userId, organizationId)
  const access = await tokenService.signAccess({ sub: userId, org: organizationId, role, session: sessionId })
  return { access, refresh: refreshToken, csrf: issueCsrfToken() }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- login.service.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Write the failing tests for `set-auth-cookies.ts`**

```ts
// apps/backend/src/auth/lib/set-auth-cookies.test.ts
import { describe, it, expect, vi } from 'vitest'
import type { FastifyReply } from 'fastify'
import { setAuthCookies, clearAuthCookies } from './set-auth-cookies.js'

function makeReply() {
  return { setCookie: vi.fn(), clearCookie: vi.fn() } as unknown as FastifyReply
}

describe('setAuthCookies', () => {
  it('seta access_token e refresh_token como httpOnly, e csrf como não-httpOnly', () => {
    const reply = makeReply()
    setAuthCookies(reply, { access: 'a', refresh: 'r', csrf: 'c' })
    expect(reply.setCookie).toHaveBeenCalledWith('access_token', 'a', expect.objectContaining({ httpOnly: true }))
    expect(reply.setCookie).toHaveBeenCalledWith('refresh_token', 'r', expect.objectContaining({ httpOnly: true }))
    expect(reply.setCookie).toHaveBeenCalledWith('csrf', 'c', expect.objectContaining({ httpOnly: false }))
  })
})

describe('clearAuthCookies', () => {
  it('limpa os três cookies', () => {
    const reply = makeReply()
    clearAuthCookies(reply)
    expect(reply.clearCookie).toHaveBeenCalledWith('access_token', expect.any(Object))
    expect(reply.clearCookie).toHaveBeenCalledWith('refresh_token', expect.any(Object))
    expect(reply.clearCookie).toHaveBeenCalledWith('csrf', expect.any(Object))
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- set-auth-cookies.test.ts`
Expected: FAIL — `Cannot find module './set-auth-cookies.js'`

- [ ] **Step 7: Implement**

```ts
// apps/backend/src/auth/lib/set-auth-cookies.ts
import type { FastifyReply } from 'fastify'

export function setAuthCookies(
  reply: FastifyReply,
  tokens: { access: string; refresh: string; csrf: string }
): void {
  reply.setCookie('access_token', tokens.access, { httpOnly: true, sameSite: 'lax', path: '/' })
  reply.setCookie('refresh_token', tokens.refresh, { httpOnly: true, sameSite: 'lax', path: '/' })
  reply.setCookie('csrf', tokens.csrf, { httpOnly: false, sameSite: 'lax', path: '/' })
}

export function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie('access_token', { path: '/' })
  reply.clearCookie('refresh_token', { path: '/' })
  reply.clearCookie('csrf', { path: '/' })
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- set-auth-cookies.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/auth/services/login.service.ts apps/backend/src/auth/services/login.service.test.ts apps/backend/src/auth/lib/set-auth-cookies.ts apps/backend/src/auth/lib/set-auth-cookies.test.ts
git commit -m "test+feat(backend): add login.service (resolveRole/completeLogin) and cookie helpers"
```

---

## Task 3: Test harness + `auth/routes/login.ts`

**Files:**
- Create: `apps/backend/src/test-utils/build-app.ts` (shared by this and every remaining route task — not production code, excluded from coverage)
- Modify: `apps/backend/vitest.config.ts` (add `'src/test-utils/**'` to coverage `exclude`)
- Create: `apps/backend/src/auth/routes/login.ts`
- Test: `apps/backend/src/auth/routes/login.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–2, plus `registerTenancyPlugin` (Plan 2), `isLocked`/`recordFailure`/`recordSuccess` (Plan 1 `lockout.service.ts`), `verifyPassword` (Plan 1 `password.service.ts`).
- Produces: `buildTestApp(db: Db, registerRoutes: (app: FastifyInstance) => Promise<void>): Promise<FastifyInstance>` — registers cookie+jwt+tenancy+a generic `AppError`→JSON error handler, then calls `registerRoutes`. `registerLoginRoute(app: FastifyInstance, db: Db): Promise<void>` — mounts `POST /api/v1/auth/login`.

- [ ] **Step 1: Add the test-utils exclude to coverage config**

In `apps/backend/vitest.config.ts`, add `'src/test-utils/**'` to the `coverage.exclude` array (alongside the existing entries).

- [ ] **Step 2: Create the shared test harness (no test of its own — it's exercised by every route test)**

```ts
// apps/backend/src/test-utils/build-app.ts
import Fastify, { type FastifyInstance } from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifyJwt from '@fastify/jwt'
import type { Db } from '../db/client.js'
import { registerTenancyPlugin } from '../tenancy/plugin.js'
import { AppError } from '../lib/errors.js'
import { env } from '../env.js'

export async function buildTestApp(
  db: Db,
  registerRoutes: (app: FastifyInstance) => Promise<void>
): Promise<FastifyInstance> {
  const app = Fastify()
  await app.register(fastifyCookie)
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { algorithm: 'HS256', expiresIn: '15m' },
    verify: { algorithms: ['HS256'] },
  })
  await registerTenancyPlugin(app, db, { publicPaths: ['/api/v1/health'] })
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof AppError) {
      return reply
        .status(err.statusCode)
        .send({ error: { code: err.code, message: err.message, details: err.details } })
    }
    request.log.error({ err }, 'Unhandled error in test app')
    return reply.status(500).send({ error: { code: 'internal', message: 'Erro interno' } })
  })
  await registerRoutes(app)
  await app.ready()
  return app
}
```

- [ ] **Step 3: Write the failing test for the login route**

```ts
// apps/backend/src/auth/routes/login.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, eq } from 'drizzle-orm'
import { createDb, type Db } from '../../db/client.js'
import { organizations, users, memberships } from '../../db/schema.js'
import { hashPassword } from '../services/password.service.js'
import { registerLoginRoute } from './login.js'
import { buildTestApp } from '../../test-utils/build-app.js'
import { env } from '../../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, users, memberships CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

async function seedOrgOwner(password: string) {
  const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
  const [user] = await db
    .insert(users)
    .values({ email: 'owner@acme.com', passwordHash: await hashPassword(password) })
    .returning()
  await db.insert(memberships).values({ userId: user.id, organizationId: org.id, role: 'owner' })
  return { org, user }
}

describe('POST /api/v1/auth/login', () => {
  it('loga com credenciais corretas: 200, cookies httpOnly, role correto', async () => {
    await seedOrgOwner('Senha123!')
    const app = await buildTestApp(db, (a) => registerLoginRoute(a, db))

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { host: 'acme.wz-hub.com' },
      payload: { email: 'owner@acme.com', password: 'Senha123!' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().role).toBe('owner')
    const cookies = res.cookies.map((c) => c.name)
    expect(cookies).toEqual(expect.arrayContaining(['access_token', 'refresh_token', 'csrf']))
    await app.close()
  })

  it('rejeita senha errada com 401 e incrementa failedLoginCount', async () => {
    const { user } = await seedOrgOwner('Senha123!')
    const app = await buildTestApp(db, (a) => registerLoginRoute(a, db))

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { host: 'acme.wz-hub.com' },
      payload: { email: 'owner@acme.com', password: 'senha-errada' },
    })

    expect(res.statusCode).toBe(401)
    const [updated] = await db.select().from(users).where(eq(users.id, user.id))
    expect(updated.failedLoginCount).toBe(1)
    await app.close()
  })

  it('bloqueia com 423 após a 5ª falha', async () => {
    await seedOrgOwner('Senha123!')
    const app = await buildTestApp(db, (a) => registerLoginRoute(a, db))

    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { host: 'acme.wz-hub.com' },
        payload: { email: 'owner@acme.com', password: 'senha-errada' },
      })
    }
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { host: 'acme.wz-hub.com' },
      payload: { email: 'owner@acme.com', password: 'Senha123!' },
    })

    expect(res.statusCode).toBe(423)
    await app.close()
  })

  it('retorna mfaChallenge (sem cookies) quando o usuário tem MFA habilitado', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [user] = await db
      .insert(users)
      .values({
        email: 'mfa@acme.com',
        passwordHash: await hashPassword('Senha123!'),
        mfaEnabled: true,
        mfaSecretEncrypted: 'irrelevante-para-este-teste',
      })
      .returning()
    await db.insert(memberships).values({ userId: user.id, organizationId: org.id, role: 'owner' })
    const app = await buildTestApp(db, (a) => registerLoginRoute(a, db))

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { host: 'acme.wz-hub.com' },
      payload: { email: 'mfa@acme.com', password: 'Senha123!' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().mfaChallenge).toBeTruthy()
    expect(res.cookies).toHaveLength(0)
    await app.close()
  })

  it('rejeita com 403 quando o usuário não tem membership na organização do subdomínio', async () => {
    await db.insert(organizations).values({ name: 'Acme', slug: 'acme' })
    await db.insert(users).values({ email: 'estranho@fora.com', passwordHash: await hashPassword('Senha123!') })
    const app = await buildTestApp(db, (a) => registerLoginRoute(a, db))

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { host: 'acme.wz-hub.com' },
      payload: { email: 'estranho@fora.com', password: 'Senha123!' },
    })

    expect(res.statusCode).toBe(403)
    await app.close()
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- login.test.ts`
Expected: FAIL — `Cannot find module './login.js'`

- [ ] **Step 5: Implement `login.ts`**

```ts
// apps/backend/src/auth/routes/login.ts
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { users } from '../../db/schema.js'
import { verifyPassword } from '../services/password.service.js'
import { isLocked, recordFailure, recordSuccess } from '../services/lockout.service.js'
import { resolveRole, completeLogin } from '../services/login.service.js'
import { createTokenService } from '../services/token.service.js'
import { stubEntitlementsResolver } from '../services/entitlements.service.js'
import { setAuthCookies } from '../lib/set-auth-cookies.js'
import { InvalidCredentialsError, LockedAccountError } from '../../lib/errors.js'

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function registerLoginRoute(app: FastifyInstance, db: Db): Promise<void> {
  const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)

  app.post(
    '/api/v1/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = LoginBody.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
      }
      const { email, password } = parsed.data

      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
      if (!user) {
        throw new InvalidCredentialsError()
      }

      if (isLocked({ failedLoginCount: user.failedLoginCount, lockedUntil: user.lockedUntil })) {
        throw new LockedAccountError(user.lockedUntil!)
      }

      const passwordOk = await verifyPassword(password, user.passwordHash)
      if (!passwordOk) {
        const next = recordFailure({ failedLoginCount: user.failedLoginCount, lockedUntil: user.lockedUntil })
        await db
          .update(users)
          .set({ failedLoginCount: next.failedLoginCount, lockedUntil: next.lockedUntil })
          .where(eq(users.id, user.id))
        throw new InvalidCredentialsError()
      }

      const reset = recordSuccess()
      await db
        .update(users)
        .set({ failedLoginCount: reset.failedLoginCount, lockedUntil: reset.lockedUntil })
        .where(eq(users.id, user.id))

      const organizationId = request.tenant?.id ?? null

      if (user.mfaEnabled) {
        const mfaChallenge = app.jwt.sign(
          { sub: user.id, org: organizationId ?? undefined, purpose: 'mfa' },
          { expiresIn: '60s' }
        )
        return reply.send({ mfaChallenge })
      }

      const role = await resolveRole(db, user.id, organizationId)
      const tokens = await completeLogin(db, tokenService, user.id, organizationId, role)
      setAuthCookies(reply, tokens)
      return reply.send({ user: { id: user.id, email: user.email }, role })
    }
  )
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- login.test.ts`
Expected: PASS (5 tests) — note: `app.inject` doesn't enforce real rate limiting the way a live listener does across separate test runs, so the 5-failed-attempts test in Step 3 will hit the lockout threshold (5) before the rate-limit threshold (10) in the same test; if it flakes on rate-limit instead, that's `@fastify/rate-limit`'s in-memory store persisting across `inject()` calls within the same `app` instance — re-run Step 3's loop test with a fresh `app` per test (already the case here, `buildTestApp` is called fresh in each `it`).

- [ ] **Step 7: Commit**

```bash
git add apps/backend/vitest.config.ts apps/backend/src/test-utils/build-app.ts apps/backend/src/auth/routes/login.ts apps/backend/src/auth/routes/login.test.ts
git commit -m "test+feat(backend): add POST /auth/login with lockout, MFA branch, and shared test harness"
```

---

## Task 4: `auth/routes/mfa-challenge.ts`

**Files:**
- Create: `apps/backend/src/auth/routes/mfa-challenge.ts`
- Test: `apps/backend/src/auth/routes/mfa-challenge.test.ts`

**Interfaces:**
- Consumes: `decryptMfaSecret`/`verifyMfaCode` (Plan 1 `mfa.service.ts`), `resolveRole`/`completeLogin` (Task 2), `setAuthCookies` (Task 2), `buildTestApp` (Task 3).
- Produces: `registerMfaChallengeRoute(app: FastifyInstance, db: Db): Promise<void>` — mounts `POST /api/v1/auth/mfa`, completing the login that `login.ts` deferred.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/auth/routes/mfa-challenge.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, eq } from 'drizzle-orm'
import { createDb, type Db } from '../../db/client.js'
import { organizations, users, memberships } from '../../db/schema.js'
import { setupMfa } from '../services/mfa.service.js'
import { encryptMfaSecret } from '../services/mfa.service.js'
import { totp } from '../lib/totp.js'
import { registerMfaChallengeRoute } from './mfa-challenge.js'
import { buildTestApp } from '../../test-utils/build-app.js'
import { env } from '../../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, users, memberships CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

async function seedMfaUser() {
  const { secret } = setupMfa('mfa@acme.com')
  const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
  const [user] = await db
    .insert(users)
    .values({
      email: 'mfa@acme.com',
      passwordHash: 'x',
      mfaEnabled: true,
      mfaSecretEncrypted: '', // set below once we know user.id
    })
    .returning()
  const encrypted = encryptMfaSecret(secret, env.JWT_SECRET, user.id)
  await db.update(users).set({ mfaSecretEncrypted: encrypted }).where(eq(users.id, user.id))
  await db.insert(memberships).values({ userId: user.id, organizationId: org.id, role: 'owner' })
  return { org, user, secret }
}

async function signChallenge(app: Awaited<ReturnType<typeof buildTestApp>>, sub: string, org: string) {
  return app.jwt.sign({ sub, org, purpose: 'mfa' }, { expiresIn: '60s' })
}

describe('POST /api/v1/auth/mfa', () => {
  it('completa o login com o código TOTP correto: 200 + cookies', async () => {
    const { org, user, secret } = await seedMfaUser()
    const app = await buildTestApp(db, (a) => registerMfaChallengeRoute(a, db))
    const mfaChallenge = await signChallenge(app, user.id, org.id)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa',
      payload: { mfaChallenge, code: totp(secret) },
    })

    expect(res.statusCode).toBe(200)
    expect(res.cookies.map((c) => c.name)).toEqual(
      expect.arrayContaining(['access_token', 'refresh_token', 'csrf'])
    )
    await app.close()
  })

  it('rejeita um código TOTP incorreto com 401 mfa-invalid', async () => {
    const { org, user } = await seedMfaUser()
    const app = await buildTestApp(db, (a) => registerMfaChallengeRoute(a, db))
    const mfaChallenge = await signChallenge(app, user.id, org.id)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa',
      payload: { mfaChallenge, code: '000000' },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('mfa-invalid')
    await app.close()
  })

  it('rejeita um challenge token inválido/expirado com 401', async () => {
    const app = await buildTestApp(db, (a) => registerMfaChallengeRoute(a, db))
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa',
      payload: { mfaChallenge: 'token-invalido', code: '123456' },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- mfa-challenge.test.ts`
Expected: FAIL — `Cannot find module './mfa-challenge.js'`

- [ ] **Step 3: Implement**

```ts
// apps/backend/src/auth/routes/mfa-challenge.ts
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { users } from '../../db/schema.js'
import { decryptMfaSecret, verifyMfaCode } from '../services/mfa.service.js'
import { resolveRole, completeLogin } from '../services/login.service.js'
import { createTokenService } from '../services/token.service.js'
import { stubEntitlementsResolver } from '../services/entitlements.service.js'
import { setAuthCookies } from '../lib/set-auth-cookies.js'
import { UnauthenticatedError, MfaNotEnrolledError, MfaInvalidError } from '../../lib/errors.js'
import { env } from '../../env.js'

const MfaChallengeBody = z.object({
  mfaChallenge: z.string(),
  code: z.string().length(6),
})

interface MfaChallengePayload {
  sub: string
  org?: string
  purpose: string
}

export async function registerMfaChallengeRoute(app: FastifyInstance, db: Db): Promise<void> {
  const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)

  app.post('/api/v1/auth/mfa', async (request, reply) => {
    const parsed = MfaChallengeBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
    }

    let payload: MfaChallengePayload
    try {
      payload = app.jwt.verify<MfaChallengePayload>(parsed.data.mfaChallenge, { algorithms: ['HS256'] })
    } catch {
      throw new UnauthenticatedError()
    }
    if (payload.purpose !== 'mfa') {
      throw new UnauthenticatedError()
    }

    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1)
    if (!user || !user.mfaSecretEncrypted) {
      throw new MfaNotEnrolledError()
    }

    const secret = decryptMfaSecret(user.mfaSecretEncrypted, env.JWT_SECRET, user.id)
    if (!verifyMfaCode(secret, parsed.data.code)) {
      throw new MfaInvalidError()
    }

    const organizationId = payload.org ?? null
    const role = await resolveRole(db, user.id, organizationId)
    const tokens = await completeLogin(db, tokenService, user.id, organizationId, role)
    setAuthCookies(reply, tokens)
    return reply.send({ user: { id: user.id, email: user.email }, role })
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- mfa-challenge.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/auth/routes/mfa-challenge.ts apps/backend/src/auth/routes/mfa-challenge.test.ts
git commit -m "test+feat(backend): add POST /auth/mfa completing the deferred login"
```

---

## Task 5: `auth/routes/refresh.ts`

**Files:**
- Create: `apps/backend/src/auth/routes/refresh.ts`
- Test: `apps/backend/src/auth/routes/refresh.test.ts`

**Interfaces:**
- Consumes: `revokeSession`/`rotateRefreshToken` (Task 1), `resolveRole` (Task 2), `verifyCsrfToken` (Plan 1 `csrf.service.ts`), `hashRefreshToken` (Plan 1 `refresh-token.ts`).
- Produces: `registerRefreshRoute(app: FastifyInstance, db: Db): Promise<void>` — mounts `POST /api/v1/auth/refresh`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/auth/routes/refresh.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, eq } from 'drizzle-orm'
import { createDb, type Db } from '../../db/client.js'
import { organizations, users, sessions, refreshTokens } from '../../db/schema.js'
import { createOrRotateSession } from '../services/session.service.js'
import { issueCsrfToken } from '../services/csrf.service.js'
import { registerRefreshRoute } from './refresh.js'
import { buildTestApp } from '../../test-utils/build-app.js'
import { env } from '../../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, users, sessions, refresh_tokens CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

async function seedSession() {
  const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
  const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
  const { sessionId, refreshToken } = await createOrRotateSession(db, user.id, org.id)
  return { org, user, sessionId, refreshToken }
}

describe('POST /api/v1/auth/refresh', () => {
  it('rotaciona o refresh token e emite um novo access token: 200', async () => {
    const { sessionId, refreshToken } = await seedSession()
    const csrf = issueCsrfToken()
    const app = await buildTestApp(db, (a) => registerRefreshRoute(a, db))

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'x-csrf-token': csrf },
      cookies: { refresh_token: refreshToken, csrf },
    })

    expect(res.statusCode).toBe(200)
    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId))
    expect(session.revokedAt).toBeNull()
    await app.close()
  })

  it('rejeita com 403 quando o header X-CSRF-Token não confere com o cookie', async () => {
    const { refreshToken } = await seedSession()
    const app = await buildTestApp(db, (a) => registerRefreshRoute(a, db))

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'x-csrf-token': 'errado' },
      cookies: { refresh_token: refreshToken, csrf: issueCsrfToken() },
    })

    expect(res.statusCode).toBe(403)
    await app.close()
  })

  it('rejeita com 401 quando não há cookie refresh_token', async () => {
    const csrf = issueCsrfToken()
    const app = await buildTestApp(db, (a) => registerRefreshRoute(a, db))

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'x-csrf-token': csrf },
      cookies: { csrf },
    })

    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('detecta replay: refresh token já revogado usado dentro de 5s revoga a sessão inteira', async () => {
    const { sessionId, refreshToken } = await seedSession()
    const csrf = issueCsrfToken()
    const app = await buildTestApp(db, (a) => registerRefreshRoute(a, db))

    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'x-csrf-token': csrf },
      cookies: { refresh_token: refreshToken, csrf },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'x-csrf-token': csrf },
      cookies: { refresh_token: refreshToken, csrf },
    })

    expect(res.statusCode).toBe(401)
    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId))
    expect(session.revokedAt).not.toBeNull()
    await app.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- refresh.test.ts`
Expected: FAIL — `Cannot find module './refresh.js'`

- [ ] **Step 3: Implement**

```ts
// apps/backend/src/auth/routes/refresh.ts
import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { refreshTokens, sessions } from '../../db/schema.js'
import { hashRefreshToken } from '../lib/refresh-token.js'
import { revokeSession, rotateRefreshToken } from '../services/session.service.js'
import { resolveRole } from '../services/login.service.js'
import { createTokenService } from '../services/token.service.js'
import { stubEntitlementsResolver } from '../services/entitlements.service.js'
import { setAuthCookies } from '../lib/set-auth-cookies.js'
import { verifyCsrfToken } from '../services/csrf.service.js'
import { CsrfMismatchError, UnauthenticatedError, SessionRevokedError } from '../../lib/errors.js'

const REPLAY_WINDOW_MS = 5000

export async function registerRefreshRoute(app: FastifyInstance, db: Db): Promise<void> {
  const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)

  app.post('/api/v1/auth/refresh', async (request, reply) => {
    if (!verifyCsrfToken(request.headers['x-csrf-token'] as string | undefined, request.cookies.csrf)) {
      throw new CsrfMismatchError()
    }

    const token = request.cookies.refresh_token
    if (!token) {
      throw new UnauthenticatedError()
    }

    const [row] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashRefreshToken(token)))
      .limit(1)
    if (!row) {
      throw new UnauthenticatedError()
    }

    if (row.revokedAt !== null) {
      if (Date.now() - row.createdAt.getTime() < REPLAY_WINDOW_MS) {
        await revokeSession(db, row.sessionId)
      }
      throw new SessionRevokedError()
    }

    const [session] = await db.select().from(sessions).where(eq(sessions.id, row.sessionId)).limit(1)
    if (!session || session.revokedAt !== null) {
      throw new SessionRevokedError()
    }

    const role = await resolveRole(db, row.userId, session.organizationId)
    const newRefreshToken = await rotateRefreshToken(db, session.id, row.userId)
    const access = await tokenService.signAccess({
      sub: row.userId,
      org: session.organizationId,
      role,
      session: session.id,
    })

    setAuthCookies(reply, { access, refresh: newRefreshToken, csrf: request.cookies.csrf ?? '' })
    return reply.send({ ok: true })
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- refresh.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/auth/routes/refresh.ts apps/backend/src/auth/routes/refresh.test.ts
git commit -m "test+feat(backend): add POST /auth/refresh with CSRF and replay detection"
```

---

## Task 6: `auth/routes/logout.ts`

**Files:**
- Create: `apps/backend/src/auth/routes/logout.ts`
- Test: `apps/backend/src/auth/routes/logout.test.ts`

**Interfaces:**
- Consumes: `createRequireAuth` (Plan 2), `revokeSession` (Task 1), `verifyCsrfToken` (Plan 1), `clearAuthCookies` (Task 2).
- Produces: `registerLogoutRoute(app: FastifyInstance, db: Db): Promise<void>` — mounts `POST /api/v1/auth/logout` (protected by `require-auth`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/auth/routes/logout.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, eq } from 'drizzle-orm'
import { createDb, type Db } from '../../db/client.js'
import { organizations, users, sessions } from '../../db/schema.js'
import { createOrRotateSession } from '../services/session.service.js'
import { createTokenService } from '../services/token.service.js'
import { stubEntitlementsResolver } from '../services/entitlements.service.js'
import { issueCsrfToken } from '../services/csrf.service.js'
import { registerLogoutRoute } from './logout.js'
import { buildTestApp } from '../../test-utils/build-app.js'
import { env } from '../../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, users, sessions CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

describe('POST /api/v1/auth/logout', () => {
  it('revoga a sessão e limpa os cookies: 200', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
    const { sessionId } = await createOrRotateSession(db, user.id, org.id)

    const app = await buildTestApp(db, (a) => registerLogoutRoute(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })
    const csrf = issueCsrfToken()

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { 'x-csrf-token': csrf },
      cookies: { access_token: access, csrf },
    })

    expect(res.statusCode).toBe(200)
    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId))
    expect(session.revokedAt).not.toBeNull()
    await app.close()
  })

  it('rejeita com 403 sem o header X-CSRF-Token correspondente', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
    const { sessionId } = await createOrRotateSession(db, user.id, org.id)

    const app = await buildTestApp(db, (a) => registerLogoutRoute(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: { access_token: access, csrf: issueCsrfToken() },
    })

    expect(res.statusCode).toBe(403)
    await app.close()
  })

  it('rejeita com 401 sem cookie access_token', async () => {
    const app = await buildTestApp(db, (a) => registerLogoutRoute(a, db))
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/logout' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- logout.test.ts`
Expected: FAIL — `Cannot find module './logout.js'`

- [ ] **Step 3: Implement**

```ts
// apps/backend/src/auth/routes/logout.ts
import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client.js'
import { createRequireAuth } from '../hooks/require-auth.js'
import { stubEntitlementsResolver } from '../services/entitlements.service.js'
import { revokeSession } from '../services/session.service.js'
import { verifyCsrfToken } from '../services/csrf.service.js'
import { clearAuthCookies } from '../lib/set-auth-cookies.js'
import { CsrfMismatchError } from '../../lib/errors.js'

export async function registerLogoutRoute(app: FastifyInstance, db: Db): Promise<void> {
  const requireAuth = createRequireAuth(db, app.jwt, stubEntitlementsResolver)

  app.post('/api/v1/auth/logout', { preHandler: requireAuth }, async (request, reply) => {
    if (!verifyCsrfToken(request.headers['x-csrf-token'] as string | undefined, request.cookies.csrf)) {
      throw new CsrfMismatchError()
    }
    await revokeSession(db, request.authUser.session)
    clearAuthCookies(reply)
    return reply.send({ ok: true })
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- logout.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/auth/routes/logout.ts apps/backend/src/auth/routes/logout.test.ts
git commit -m "test+feat(backend): add POST /auth/logout"
```

---

## Task 7: `auth/routes/me.ts`

**Files:**
- Create: `apps/backend/src/auth/routes/me.ts`
- Test: `apps/backend/src/auth/routes/me.test.ts`

**Interfaces:**
- Consumes: `createRequireAuth` (Plan 2).
- Produces: `registerMeRoute(app: FastifyInstance, db: Db): Promise<void>` — mounts `GET /api/v1/auth/me`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/auth/routes/me.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../../db/client.js'
import { organizations, users } from '../../db/schema.js'
import { createOrRotateSession } from '../services/session.service.js'
import { createTokenService } from '../services/token.service.js'
import { stubEntitlementsResolver } from '../services/entitlements.service.js'
import { registerMeRoute } from './me.js'
import { buildTestApp } from '../../test-utils/build-app.js'
import { env } from '../../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, users, sessions CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

describe('GET /api/v1/auth/me', () => {
  it('retorna os dados do usuário autenticado: 200', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
    const { sessionId } = await createOrRotateSession(db, user.id, org.id)

    const app = await buildTestApp(db, (a) => registerMeRoute(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      cookies: { access_token: access },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ id: user.id, email: 'a@acme.com', role: 'owner', org: org.id })
    await app.close()
  })

  it('rejeita com 401 sem cookie access_token', async () => {
    const app = await buildTestApp(db, (a) => registerMeRoute(a, db))
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/me' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- me.test.ts`
Expected: FAIL — `Cannot find module './me.js'`

- [ ] **Step 3: Implement**

```ts
// apps/backend/src/auth/routes/me.ts
import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { users } from '../../db/schema.js'
import { createRequireAuth } from '../hooks/require-auth.js'
import { stubEntitlementsResolver } from '../services/entitlements.service.js'

export async function registerMeRoute(app: FastifyInstance, db: Db): Promise<void> {
  const requireAuth = createRequireAuth(db, app.jwt, stubEntitlementsResolver)

  app.get('/api/v1/auth/me', { preHandler: requireAuth }, async (request) => {
    const [user] = await db.select().from(users).where(eq(users.id, request.authUser.sub)).limit(1)
    return {
      id: user.id,
      email: user.email,
      role: request.authUser.role,
      org: request.authUser.org ?? null,
      products: request.authUser.products,
    }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- me.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/auth/routes/me.ts apps/backend/src/auth/routes/me.test.ts
git commit -m "test+feat(backend): add GET /auth/me"
```

---

## Task 8: `auth/routes/mfa.ts` (setup / enable / disable)

**Files:**
- Create: `apps/backend/src/auth/routes/mfa.ts`
- Test: `apps/backend/src/auth/routes/mfa.test.ts`

**Interfaces:**
- Consumes: `createRequireAuth` (Plan 2), `setupMfa`/`verifyMfaCode`/`encryptMfaSecret`/`decryptMfaSecret` (Plan 1 `mfa.service.ts`).
- Produces: `registerMfaRoutes(app: FastifyInstance, db: Db): Promise<void>` — mounts `GET /api/v1/mfa/setup`, `POST /api/v1/mfa/enable`, `POST /api/v1/mfa/disable`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/auth/routes/mfa.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, eq } from 'drizzle-orm'
import { createDb, type Db } from '../../db/client.js'
import { organizations, users } from '../../db/schema.js'
import { createOrRotateSession } from '../services/session.service.js'
import { createTokenService } from '../services/token.service.js'
import { stubEntitlementsResolver } from '../services/entitlements.service.js'
import { totp } from '../lib/totp.js'
import { registerMfaRoutes } from './mfa.js'
import { buildTestApp } from '../../test-utils/build-app.js'
import { env } from '../../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, users, sessions CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

async function seedAuthedUser() {
  const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
  const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
  const { sessionId } = await createOrRotateSession(db, user.id, org.id)
  return { org, user, sessionId }
}

describe('mfa routes', () => {
  it('GET /mfa/setup retorna secret e otpauthUrl', async () => {
    const { user, org, sessionId } = await seedAuthedUser()
    const app = await buildTestApp(db, (a) => registerMfaRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })

    const res = await app.inject({ method: 'GET', url: '/api/v1/mfa/setup', cookies: { access_token: access } })

    expect(res.statusCode).toBe(200)
    expect(res.json().secret).toMatch(/^[A-Z2-7]+$/)
    await app.close()
  })

  it('POST /mfa/enable com código correto habilita MFA no banco', async () => {
    const { user, org, sessionId } = await seedAuthedUser()
    const app = await buildTestApp(db, (a) => registerMfaRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })

    const setupRes = await app.inject({ method: 'GET', url: '/api/v1/mfa/setup', cookies: { access_token: access } })
    const { secret } = setupRes.json()

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/mfa/enable',
      cookies: { access_token: access },
      payload: { secret, code: totp(secret) },
    })

    expect(res.statusCode).toBe(200)
    const [updated] = await db.select().from(users).where(eq(users.id, user.id))
    expect(updated.mfaEnabled).toBe(true)
    await app.close()
  })

  it('POST /mfa/enable com código errado retorna 401 mfa-invalid', async () => {
    const { user, org, sessionId } = await seedAuthedUser()
    const app = await buildTestApp(db, (a) => registerMfaRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/mfa/enable',
      cookies: { access_token: access },
      payload: { secret: 'JBSWY3DPEHPK3PXP', code: '000000' },
    })

    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('POST /mfa/disable sem MFA habilitado retorna 400 mfa-not-enrolled', async () => {
    const { user, org, sessionId } = await seedAuthedUser()
    const app = await buildTestApp(db, (a) => registerMfaRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'owner', session: sessionId })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/mfa/disable',
      cookies: { access_token: access },
      payload: { code: '000000' },
    })

    expect(res.statusCode).toBe(400)
    await app.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- mfa.test.ts` (from `src/auth/routes/`, distinct from `src/auth/services/mfa.service.test.ts`)
Expected: FAIL — `Cannot find module './mfa.js'`

- [ ] **Step 3: Implement**

```ts
// apps/backend/src/auth/routes/mfa.ts
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { users } from '../../db/schema.js'
import { createRequireAuth } from '../hooks/require-auth.js'
import { stubEntitlementsResolver } from '../services/entitlements.service.js'
import { setupMfa, verifyMfaCode, encryptMfaSecret, decryptMfaSecret } from '../services/mfa.service.js'
import { MfaInvalidError, MfaNotEnrolledError } from '../../lib/errors.js'
import { env } from '../../env.js'

const EnableBody = z.object({ secret: z.string(), code: z.string().length(6) })
const DisableBody = z.object({ code: z.string().length(6) })

export async function registerMfaRoutes(app: FastifyInstance, db: Db): Promise<void> {
  const requireAuth = createRequireAuth(db, app.jwt, stubEntitlementsResolver)

  app.get('/api/v1/mfa/setup', { preHandler: requireAuth }, async (request) => {
    const [user] = await db.select().from(users).where(eq(users.id, request.authUser.sub)).limit(1)
    return setupMfa(user.email)
  })

  app.post('/api/v1/mfa/enable', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = EnableBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
    }
    if (!verifyMfaCode(parsed.data.secret, parsed.data.code)) {
      throw new MfaInvalidError()
    }
    const encrypted = encryptMfaSecret(parsed.data.secret, env.JWT_SECRET, request.authUser.sub)
    await db
      .update(users)
      .set({ mfaSecretEncrypted: encrypted, mfaEnabled: true })
      .where(eq(users.id, request.authUser.sub))
    return reply.send({ ok: true })
  })

  app.post('/api/v1/mfa/disable', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = DisableBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
    }
    const [user] = await db.select().from(users).where(eq(users.id, request.authUser.sub)).limit(1)
    if (!user.mfaEnabled || !user.mfaSecretEncrypted) {
      throw new MfaNotEnrolledError()
    }
    const secret = decryptMfaSecret(user.mfaSecretEncrypted, env.JWT_SECRET, user.id)
    if (!verifyMfaCode(secret, parsed.data.code)) {
      throw new MfaInvalidError()
    }
    await db.update(users).set({ mfaSecretEncrypted: null, mfaEnabled: false }).where(eq(users.id, user.id))
    return reply.send({ ok: true })
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- mfa.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/auth/routes/mfa.ts apps/backend/src/auth/routes/mfa.test.ts
git commit -m "test+feat(backend): add GET/POST /mfa/setup,enable,disable"
```

---

## Task 9: `server.ts` wiring

**Files:**
- Modify: `apps/backend/src/server.ts` (entire "Rotas de negócio... são registradas pelas frentes paralelas" comment block and below gets replaced)

**Interfaces:**
- Consumes: every `register*Route`/`register*Plugin` function from Tasks 1–8 and Plan 2.
- Produces: a running server with the full login → MFA → refresh → logout → me → mfa-setup surface mounted under `/api/v1`.

Not TDD — this is composition-root wiring with no new logic of its own (every piece it calls already has its own tests). Verified by the Task 10 full-suite run and the Task 11 manual smoke test.

- [ ] **Step 1: Rewrite `server.ts`**

```ts
// apps/backend/src/server.ts
import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import { env } from './env.js'
import { createDb } from './db/client.js'
import { registerAuthPlugin } from './auth/plugin.js'
import { registerTenancyPlugin } from './tenancy/plugin.js'
import { registerLoginRoute } from './auth/routes/login.js'
import { registerMfaChallengeRoute } from './auth/routes/mfa-challenge.js'
import { registerRefreshRoute } from './auth/routes/refresh.js'
import { registerLogoutRoute } from './auth/routes/logout.js'
import { registerMeRoute } from './auth/routes/me.js'
import { registerMfaRoutes } from './auth/routes/mfa.js'
import { AppError } from './lib/errors.js'

const API = '/api/v1'

const app = Fastify({
  logger: env.NODE_ENV !== 'test',
})

const { db } = createDb(env.DATABASE_URL)

await app.register(helmet)
await app.register(cors, {
  credentials: true,
  origin: (origin, cb) => {
    if (!origin) {
      return cb(null, true)
    }
    const host = new URL(origin).hostname
    if (host === env.BASE_DOMAIN || host.endsWith(`.${env.BASE_DOMAIN}`)) {
      return cb(null, true)
    }
    cb(new Error('Not allowed by CORS'), false)
  },
})

await app.register(swagger, {
  openapi: {
    info: {
      title: 'WZ Connect API',
      version: '0.1.0',
      description: 'Auth + Tenancy + Catálogo/Planos do wz-hub',
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    security: [{ bearerAuth: [] }],
  },
})
await app.register(swaggerUi, {
  routePrefix: `${API}/docs`,
  uiConfig: { docExpansion: 'list' },
})

await app.register(rateLimit, {
  global: true,
  max: 200,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip,
})

await registerAuthPlugin(app)
await registerTenancyPlugin(app, db, { publicPaths: [`${API}/health`, `${API}/docs`] })

app.setErrorHandler((err, request, reply) => {
  if (err instanceof AppError) {
    request.log.warn({ code: err.code, statusCode: err.statusCode }, err.message)
    return reply
      .status(err.statusCode)
      .send({ error: { code: err.code, message: err.message, details: err.details } })
  }
  if ((err as { statusCode?: number }).statusCode === 429) {
    return reply
      .status(429)
      .send({ error: { code: 'rate-limit', message: 'Muitas requisições. Tente novamente em instantes.' } })
  }
  request.log.error({ err }, 'Unhandled error')
  return reply.status(500).send({ error: { code: 'internal', message: 'Erro interno. Tente novamente.' } })
})

app.get(`${API}/health`, async () => ({ status: 'ok' }))

await registerLoginRoute(app, db)
await registerMfaChallengeRoute(app, db)
await registerRefreshRoute(app, db)
await registerLogoutRoute(app, db)
await registerMeRoute(app, db)
await registerMfaRoutes(app, db)

const port = env.PORT
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Type-check and build**

Run: `pnpm --filter @wz/connect-backend build`
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/server.ts
git commit -m "feat(backend): wire auth routes, tenancy, helmet, cors and global error handler into server.ts"
```

---

## Task 10: Full suite + coverage check

- [ ] **Step 1: Confirm Postgres is up and migrated** (already done in Plan 2 — just verify)

Run: `docker compose up -d postgres` (from `wz-connect/`)

- [ ] **Step 2: Run the full backend suite with coverage**

Run: `pnpm --filter @wz/connect-backend test:coverage`
Expected: all test files from Plans 1–3 pass; coverage ≥85% (route files under `src/**/routes/**` and `src/**/routes.ts` stay excluded from the threshold per `vitest.config.ts` — they're covered by the integration tests in Tasks 3–8, just not counted toward the numeric gate, consistent with spec §7's "handlers Fastify não entram na cobertura obrigatória").

- [ ] **Step 3: If any threshold is under 85%, add the missing test case(s), red→green, then re-run**

- [ ] **Step 4: Commit if any test file was touched in Step 3**

```bash
git add apps/backend/src
git commit -m "test(backend): close coverage gaps found by full-suite run (Plan 3)"
```

---

## Task 11: Manual smoke test — the real login flow

This is what proves the whole Frente A auth core actually works, not just its tests.

- [ ] **Step 1: Start the real server**

Run (from `wz-connect/`): `docker compose up -d postgres`
Run (from `apps/backend/`): `pnpm dev` — leave it running in one terminal.

- [ ] **Step 2: Seed a test organization, owner user, and membership**

In a second terminal, compute a bcrypt hash:

```bash
node -e "import('bcryptjs').then(async (b) => console.log(await b.hash('Senha123!', 12)))"
```

Copy the printed hash, then (from `wz-connect/`):

```bash
docker compose exec postgres psql -U wzconnect -d wz_connect -c "
INSERT INTO organizations (name, slug) VALUES ('Acme', 'acme') RETURNING id;
"
```

Copy the returned `id` as `ORG_ID`, then:

```bash
docker compose exec postgres psql -U wzconnect -d wz_connect -c "
INSERT INTO users (email, password_hash) VALUES ('owner@acme.com', '<hash from Step 2>') RETURNING id;
"
```

Copy the returned `id` as `USER_ID`, then:

```bash
docker compose exec postgres psql -U wzconnect -d wz_connect -c "
INSERT INTO memberships (user_id, organization_id, role, status) VALUES ('<USER_ID>', '<ORG_ID>', 'owner', 'active');
"
```

- [ ] **Step 3: Login**

`BASE_DOMAIN=localhost` (from `.env`), so `acme.localhost` resolves as the `acme` tenant via the `Host` header — no real DNS needed:

```bash
curl -i -c cookies.txt -H "Host: acme.localhost" -H "Content-Type: application/json" \
  -X POST http://localhost:3000/api/v1/auth/login \
  -d '{"email":"owner@acme.com","password":"Senha123!"}'
```

Expected: `200`, JSON body `{"user":{...},"role":"owner"}`, and `Set-Cookie` headers for `access_token` (HttpOnly), `refresh_token` (HttpOnly), `csrf` (not HttpOnly) — visible in the response headers and saved into `cookies.txt`.

- [ ] **Step 4: Call `/auth/me`**

```bash
curl -i -b cookies.txt -H "Host: acme.localhost" http://localhost:3000/api/v1/auth/me
```

Expected: `200`, `{"id":"...","email":"owner@acme.com","role":"owner","org":"<ORG_ID>","products":[]}`.

- [ ] **Step 5: Refresh**

Read the `csrf` cookie value out of `cookies.txt` (it's not HttpOnly so `curl` can see it), then:

```bash
CSRF=$(grep csrf cookies.txt | awk '{print $NF}')
curl -i -b cookies.txt -c cookies.txt -H "Host: acme.localhost" -H "X-CSRF-Token: $CSRF" \
  -X POST http://localhost:3000/api/v1/auth/refresh
```

Expected: `200`, `{"ok":true}`, and `cookies.txt` now has a new `access_token`/`refresh_token` pair.

- [ ] **Step 6: Logout**

```bash
CSRF=$(grep csrf cookies.txt | awk '{print $NF}')
curl -i -b cookies.txt -H "Host: acme.localhost" -H "X-CSRF-Token: $CSRF" \
  -X POST http://localhost:3000/api/v1/auth/logout
```

Expected: `200`, `{"ok":true}`.

- [ ] **Step 7: Confirm the session is really gone**

```bash
curl -i -b cookies.txt -H "Host: acme.localhost" http://localhost:3000/api/v1/auth/me
```

Expected: `401` (the `access_token` cookie from before logout is still in `cookies.txt`, but its session is revoked — this is the single-session/logout guarantee working end to end).

- [ ] **Step 8: Stop the dev server** (Ctrl+C in the first terminal) once all seven checks above match.

No commit for this task — it's verification, not a code change. If any step doesn't match, that's a real bug to fix (new failing test in the relevant route file, red→green, then re-run this task from Step 3).
