# Onboarding, Memberships & Invites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a new customer create an organization (and log in as its owner), and let an org owner/admin manage members — directly or via email invite.

**Architecture:** Same shape as Plans 1–3: thin Fastify routes over small service functions, real-Postgres integration tests via the existing `buildTestApp` harness. **Plan 4 of the Frente A sequence** — covers the org-lifecycle slice (onboarding + memberships + invites); audit and impersonation stay in Plan 5.

**Tech Stack:** Same as Plans 1–3 (Fastify 5, Drizzle 0.33, Zod, Vitest 2.x + real Postgres, file parallelism disabled).

## Global Constraints

- TDD required for every task (user's standing instruction).
- Coverage ≥85%; route files stay excluded from the numeric gate (same `vitest.config.ts` pattern as Plans 2–3).
- Relative imports use `.js` (NodeNext).
- **Never compare `Date.now()` to a Postgres timestamp** (memory: ~30s clock drift observed between this Docker/WSL2 Postgres and the Windows host). Any expiry check runs inside Postgres via `sql\`... < now()\``, same pattern as `refresh.ts`'s `withinReplayWindow`.
- No new schema changes — `organizations`, `memberships`, `invites` are used exactly as they already exist.
- Every task ends with a commit.

---

## Task 1: New error classes — `SlugTakenError`, `InviteInvalidError`, `InviteEmailMismatchError`

**Files:**
- Modify: `apps/backend/src/lib/errors.ts`
- Modify: `apps/backend/src/lib/errors.test.ts`

**Interfaces:**
- Produces: `SlugTakenError` (409, `slug-taken`) — Task 2. `InviteInvalidError` (404, `invite-invalid`) — Task 6. `InviteEmailMismatchError` (403, `invite-email-mismatch`) — Task 6.

- [ ] **Step 1: Write the failing tests**

Add `SlugTakenError, InviteInvalidError, InviteEmailMismatchError` to the import list in `errors.test.ts`, and append inside `describe('subclasses de AppError', ...)`:

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

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- errors.test.ts`
Expected: FAIL — the three classes are not exported

- [ ] **Step 3: Implement**

Append to `errors.ts`:

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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- errors.test.ts`
Expected: PASS (17 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/errors.ts apps/backend/src/lib/errors.test.ts
git commit -m "test+feat(backend): add SlugTakenError, InviteInvalidError, InviteEmailMismatchError"
```

---

## Task 2: `onboarding/service.ts`

**Files:**
- Create: `apps/backend/src/onboarding/service.ts`
- Test: `apps/backend/src/onboarding/service.test.ts`

**Interfaces:**
- Consumes: `hashPassword` (`../auth/services/password.service.js`), `createOrRotateSession` (`../auth/services/session.service.js`), `issueCsrfToken` (`../auth/services/csrf.service.js`), `createTokenService`/`JwtSigner` (`../auth/services/token.service.js`), `SlugTakenError` (Task 1).
- Produces: `interface OnboardOrganizationInput { name: string; slug: string; cnpj?: string; billingEmail: string; admin: { email: string; password: string } }`, `onboardOrganization(db: Db, tokenService, input: OnboardOrganizationInput): Promise<{ organizationId: string; userId: string; access: string; refresh: string; csrf: string }>`. Task 3 (route) calls this.

- [ ] **Step 1: Write the failing test**

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

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- onboarding/service.test.ts`
Expected: FAIL — `Cannot find module './service.js'`

- [ ] **Step 3: Implement**

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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- onboarding/service.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/onboarding/service.ts apps/backend/src/onboarding/service.test.ts
git commit -m "test+feat(backend): add onboardOrganization service"
```

---

## Task 3: `onboarding/routes.ts`

**Files:**
- Create: `apps/backend/src/onboarding/routes.ts`
- Test: `apps/backend/src/onboarding/routes.test.ts`

**Interfaces:**
- Consumes: `onboardOrganization` (Task 2), `setAuthCookies` (`../auth/lib/set-auth-cookies.js`), `buildTestApp` (`../test-utils/build-app.js`).
- Produces: `registerOnboardingRoute(app: FastifyInstance, db: Db): Promise<void>` — mounts `POST /api/v1/onboarding/organization`. Called from the apex domain (no org exists yet), which the tenancy plugin already treats as `request.tenant = null` — no `publicPaths` change needed.

- [ ] **Step 1: Write the failing test**

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

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- onboarding/routes.test.ts`
Expected: FAIL — `Cannot find module './routes.js'`

- [ ] **Step 3: Implement**

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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- onboarding/routes.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/onboarding/routes.ts apps/backend/src/onboarding/routes.test.ts
git commit -m "test+feat(backend): add POST /onboarding/organization"
```

---

## Task 4: `memberships/service.ts`

**Files:**
- Create: `apps/backend/src/memberships/service.ts`
- Test: `apps/backend/src/memberships/service.test.ts`

**Interfaces:**
- Consumes: `CrossOrgAccessError` (`../lib/errors.js`, Plan 1).
- Produces: `interface MembershipRow { id: string; userId: string; organizationId: string; role: string; status: string; createdAt: Date }`, `listMemberships(db: Db, organizationId: string): Promise<MembershipRow[]>`, `createMembership(db: Db, organizationId: string, userId: string, role: string): Promise<MembershipRow>`, `updateMembershipRole(db: Db, organizationId: string, membershipId: string, role: string): Promise<MembershipRow>` (throws `CrossOrgAccessError` if the membership belongs to a different org). Task 5 (routes) calls all three.

- [ ] **Step 1: Write the failing test**

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

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- memberships/service.test.ts`
Expected: FAIL — `Cannot find module './service.js'`

- [ ] **Step 3: Implement**

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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- memberships/service.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/memberships/service.ts apps/backend/src/memberships/service.test.ts
git commit -m "test+feat(backend): add memberships service (list/create/update role)"
```

---

## Task 5: `memberships/routes.ts`

**Files:**
- Create: `apps/backend/src/memberships/routes.ts`
- Test: `apps/backend/src/memberships/routes.test.ts`

**Interfaces:**
- Consumes: `listMemberships`/`createMembership`/`updateMembershipRole` (Task 4), `createRequireAuth` (Plan 2), `requireRole` (Plan 2), `NotAMemberError` (Plan 1).
- Produces: `registerMembershipsRoutes(app: FastifyInstance, db: Db): Promise<void>` — mounts `GET/POST /api/v1/memberships`, `PUT /api/v1/memberships/:id`.

- [ ] **Step 1: Write the failing test**

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

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- memberships/routes.test.ts`
Expected: FAIL — `Cannot find module './routes.js'`

- [ ] **Step 3: Implement**

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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- memberships/routes.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/memberships/routes.ts apps/backend/src/memberships/routes.test.ts
git commit -m "test+feat(backend): add GET/POST /memberships and PUT /memberships/:id"
```

---

## Task 6: `invites/service.ts`

**Files:**
- Create: `apps/backend/src/invites/service.ts`
- Test: `apps/backend/src/invites/service.test.ts`

**Interfaces:**
- Consumes: `generateRefreshToken` (`../auth/lib/refresh-token.js` — reused as a generic opaque-token generator for the invite token, same 43-char base64url shape), `hashPassword` (`../auth/services/password.service.js`), `createOrRotateSession` (`../auth/services/session.service.js`), `issueCsrfToken` (`../auth/services/csrf.service.js`), `createTokenService` (`../auth/services/token.service.js`), `InviteInvalidError`/`InviteEmailMismatchError` (Task 1), `AppError` (Plan 1, used directly for the one-off "password required" case — no dedicated subclass needed for something this specific).
- Produces: `createInvite(db: Db, organizationId: string, email: string, role: string): Promise<{ token: string }>`. `previewInvite(db: Db, token: string): Promise<{ organizationName: string; role: string; expired: boolean }>`. `interface AcceptInviteInput { authedUserEmail?: string; password?: string }`, `acceptInvite(db: Db, tokenService, token: string, input: AcceptInviteInput): Promise<{ organizationId: string; userId: string; role: string; access: string; refresh: string; csrf: string }>`. Task 7 (routes) calls all three.

- [ ] **Step 1: Write the failing test**

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

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- invites/service.test.ts`
Expected: FAIL — `Cannot find module './service.js'`

- [ ] **Step 3: Implement**

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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- invites/service.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/invites/service.ts apps/backend/src/invites/service.test.ts
git commit -m "test+feat(backend): add invites service (create/preview/accept)"
```

---

## Task 7: `invites/routes.ts`

**Files:**
- Create: `apps/backend/src/invites/routes.ts`
- Test: `apps/backend/src/invites/routes.test.ts`

**Interfaces:**
- Consumes: `createInvite`/`previewInvite`/`acceptInvite` (Task 6), `createRequireAuth`/`requireRole` (Plan 2), `setAuthCookies` (Plan 3), `createTokenService` (Plan 2).
- Produces: `registerInvitesRoutes(app: FastifyInstance, db: Db): Promise<void>` — mounts `POST /api/v1/invites` (authenticated, owner/admin), `GET /api/v1/invites/:token` (anonymous preview), `POST /api/v1/invites/:token/accept` (works both anonymous — new user + password — and authenticated — existing user).

- [ ] **Step 1: Write the failing test**

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

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @wz/connect-backend test -- invites/routes.test.ts`
Expected: FAIL — `Cannot find module './routes.js'`

- [ ] **Step 3: Implement**

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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @wz/connect-backend test -- invites/routes.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/invites/routes.ts apps/backend/src/invites/routes.test.ts
git commit -m "test+feat(backend): add POST /invites, GET /invites/:token, POST /invites/:token/accept"
```

---

## Task 8: `server.ts` wiring

**Files:**
- Modify: `apps/backend/src/server.ts`

**Interfaces:**
- Consumes: `registerOnboardingRoute` (Task 3), `registerMembershipsRoutes` (Task 5), `registerInvitesRoutes` (Task 7).

Not TDD — composition-root wiring, same as Plan 3 Task 9. Verified by Task 9's full-suite run and Task 10's manual smoke test.

- [ ] **Step 1: Add the three imports and registration calls**

In `apps/backend/src/server.ts`, add to the import block:

```ts
import { registerOnboardingRoute } from './onboarding/routes.js'
import { registerMembershipsRoutes } from './memberships/routes.js'
import { registerInvitesRoutes } from './invites/routes.js'
```

And after the existing `await registerMfaRoutes(app, db)` line, add:

```ts
await registerOnboardingRoute(app, db)
await registerMembershipsRoutes(app, db)
await registerInvitesRoutes(app, db)
```

- [ ] **Step 2: Type-check and build**

Run: `pnpm --filter @wz/connect-backend build`
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/server.ts
git commit -m "feat(backend): wire onboarding, memberships and invites routes into server.ts"
```

---

## Task 9: Full suite + coverage check

- [ ] **Step 1: Confirm Postgres is up**

Run: `docker compose up -d postgres` (from `wz-connect/`)

- [ ] **Step 2: Run the full backend suite with coverage**

Run: `pnpm --filter @wz/connect-backend test:coverage`
Expected: all test files from Plans 1–4 pass; coverage ≥85%.

- [ ] **Step 3: If any threshold is under 85%, add the missing test case(s), red→green, then re-run**

- [ ] **Step 4: Commit if any test file was touched in Step 3**

```bash
git add apps/backend/src
git commit -m "test(backend): close coverage gaps found by full-suite run (Plan 4)"
```

---

## Task 10: Manual smoke test — onboarding → invite → accept

- [ ] **Step 1: Start the real server**

Run (from `wz-connect/`): `docker compose up -d postgres`
Run (from `apps/backend/`): `pnpm dev`

- [ ] **Step 2: Onboard a new organization**

```bash
curl -i -c /tmp/wzcookies.txt -H "Host: localhost" -H "Content-Type: application/json" \
  -X POST http://localhost:3000/api/v1/onboarding/organization \
  -d '{"name":"Beta","slug":"beta","billing_email":"billing@beta.com","admin":{"email":"owner@beta.com","password":"Senha123!"}}'
```

Expected: `201`, body has `organizationId` and `userId`, cookies set (owner is already logged in).

- [ ] **Step 3: Invite a teammate**

```bash
curl -s -b /tmp/wzcookies.txt -H "Host: beta.localhost" -H "Content-Type: application/json" \
  -X POST http://localhost:3000/api/v1/invites \
  -d '{"email":"colega@beta.com","role":"viewer"}'
```

Expected: `{"token":"..."}`. Copy the token as `INVITE_TOKEN`.

- [ ] **Step 4: Preview the invite anonymously**

```bash
curl -s -H "Host: localhost" http://localhost:3000/api/v1/invites/INVITE_TOKEN
```

Expected: `{"organizationName":"Beta","role":"viewer","expired":false}`.

- [ ] **Step 5: Accept the invite as a brand-new user**

```bash
curl -i -c /tmp/wzcookies2.txt -H "Host: localhost" -H "Content-Type: application/json" \
  -X POST http://localhost:3000/api/v1/invites/INVITE_TOKEN/accept \
  -d '{"password":"OutraSenha123!"}'
```

Expected: `200`, cookies set for the new teammate.

- [ ] **Step 6: Confirm the new teammate shows up in the org's member list**

```bash
curl -s -b /tmp/wzcookies.txt -H "Host: beta.localhost" http://localhost:3000/api/v1/memberships
```

Expected: an array with two entries — the owner and the newly-accepted `colega@beta.com`, both `status: "active"`.

- [ ] **Step 7: Stop the dev server and clean up**

Ctrl+C the dev server; `rm -f /tmp/wzcookies.txt /tmp/wzcookies2.txt`.

No commit for this task — it's verification. If any step doesn't match, that's a bug: red→green in the relevant service/route test, then re-run this task.
