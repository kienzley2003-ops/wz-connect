import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../db/client.js'
import { organizations, users, memberships, auditEvents } from '../db/schema.js'
import { createOrRotateSession } from '../auth/services/session.service.js'
import { createTokenService } from '../auth/services/token.service.js'
import { stubEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { registerAuditRoutes } from './routes.js'
import { buildTestApp } from '../test-utils/build-app.js'
import { env } from '../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, users, memberships, sessions, audit_events CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

describe('POST /api/v1/audit', () => {
  it('grava um evento atribuído ao usuário autenticado: 201', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
    const { sessionId } = await createOrRotateSession(db, user.id, org.id)
    const app = await buildTestApp(db, (a) => registerAuditRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'operator', session: sessionId })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audit',
      headers: { host: 'acme.wz-hub.com' },
      cookies: { access_token: access },
      payload: { product: 'masterfila', action: 'ticket.create', target: 'ticket-123' },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().actorId).toBe(user.id)
    expect(res.json().organizationId).toBe(org.id)
    await app.close()
  })

  it('rejeita com 400 quando product não é reconhecido', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
    const { sessionId } = await createOrRotateSession(db, user.id, org.id)
    const app = await buildTestApp(db, (a) => registerAuditRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'operator', session: sessionId })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audit',
      headers: { host: 'acme.wz-hub.com' },
      cookies: { access_token: access },
      payload: { product: 'inexistente', action: 'x' },
    })

    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('rejeita com 401 sem sessão', async () => {
    const app = await buildTestApp(db, (a) => registerAuditRoutes(a, db))
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audit',
      payload: { product: 'connect', action: 'x' },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })
})

describe('GET /api/v1/audit-events', () => {
  it('super_admin vê eventos de qualquer organização', async () => {
    const [orgA] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [orgB] = await db.insert(organizations).values({ name: 'Beta', slug: 'beta' }).returning()
    const [superAdmin] = await db
      .insert(users)
      .values({ email: 'root@wz.com', passwordHash: 'x', isSuperAdmin: true })
      .returning()
    const { sessionId } = await createOrRotateSession(db, superAdmin.id, null)
    await db.insert(auditEvents).values({ organizationId: orgA.id, actorId: superAdmin.id, product: 'connect', action: 'a' })
    await db.insert(auditEvents).values({ organizationId: orgB.id, actorId: superAdmin.id, product: 'connect', action: 'b' })

    const app = await buildTestApp(db, (a) => registerAuditRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: superAdmin.id, org: null, role: 'super_admin', session: sessionId })

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/audit-events',
      headers: { host: env.BASE_DOMAIN },
      cookies: { access_token: access },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(2)
    await app.close()
  })

  it('owner/admin vê apenas eventos da própria organização', async () => {
    const [orgA] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [orgB] = await db.insert(organizations).values({ name: 'Beta', slug: 'beta' }).returning()
    const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
    await db.insert(memberships).values({ userId: user.id, organizationId: orgA.id, role: 'owner' })
    const { sessionId } = await createOrRotateSession(db, user.id, orgA.id)
    await db.insert(auditEvents).values({ organizationId: orgA.id, actorId: user.id, product: 'connect', action: 'a' })
    await db.insert(auditEvents).values({ organizationId: orgB.id, actorId: user.id, product: 'connect', action: 'b' })

    const app = await buildTestApp(db, (a) => registerAuditRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: orgA.id, role: 'owner', session: sessionId })

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/audit-events',
      headers: { host: 'acme.wz-hub.com' },
      cookies: { access_token: access },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
    expect(res.json()[0].organizationId).toBe(orgA.id)
    await app.close()
  })

  it('rejeita com 403 quando o role não é owner/admin/super_admin', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
    await db.insert(memberships).values({ userId: user.id, organizationId: org.id, role: 'viewer' })
    const { sessionId } = await createOrRotateSession(db, user.id, org.id)

    const app = await buildTestApp(db, (a) => registerAuditRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: org.id, role: 'viewer', session: sessionId })

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/audit-events',
      headers: { host: 'acme.wz-hub.com' },
      cookies: { access_token: access },
    })

    expect(res.statusCode).toBe(403)
    await app.close()
  })
})
