import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { sql, eq } from 'drizzle-orm'
import Fastify, { type FastifyInstance } from 'fastify'
import fastifyJwt from '@fastify/jwt'
import { createDb, type Db } from '../db/client.js'
import { organizations, users, auditEvents } from '../db/schema.js'
import { impersonateOrganization } from './service.js'
import { createTokenService } from '../auth/services/token.service.js'
import { stubEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { OrganizationNotFoundError } from '../lib/errors.js'
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
  await db.execute(sql`TRUNCATE TABLE organizations, users, sessions, audit_events CASCADE`)
})

describe('impersonateOrganization', () => {
  it('emite token com org, role admin e impersonatedBy setados, e cria sessão', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [superAdmin] = await db
      .insert(users)
      .values({ email: 'root@wz.com', passwordHash: 'x', isSuperAdmin: true })
      .returning()
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)

    const result = await impersonateOrganization(db, tokenService, superAdmin.id, org.id)

    const payload = tokenService.verifyAccess(result.access)
    expect(payload.org).toBe(org.id)
    expect(payload.role).toBe('admin')
    expect(payload.impersonatedBy).toBe(superAdmin.id)
    expect(payload.sub).toBe(superAdmin.id)
    expect(result.refresh).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('grava um evento de auditoria impersonation.start', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [superAdmin] = await db
      .insert(users)
      .values({ email: 'root@wz.com', passwordHash: 'x', isSuperAdmin: true })
      .returning()
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)

    await impersonateOrganization(db, tokenService, superAdmin.id, org.id)

    const [event] = await db.select().from(auditEvents).where(eq(auditEvents.action, 'impersonation.start'))
    expect(event.organizationId).toBe(org.id)
    expect(event.actorId).toBe(superAdmin.id)
    expect(event.impersonatedBy).toBe(superAdmin.id)
  })

  it('lança OrganizationNotFoundError quando a organização não existe', async () => {
    const [superAdmin] = await db
      .insert(users)
      .values({ email: 'root@wz.com', passwordHash: 'x', isSuperAdmin: true })
      .returning()
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)

    await expect(
      impersonateOrganization(db, tokenService, superAdmin.id, '00000000-0000-0000-0000-000000000000')
    ).rejects.toThrow(OrganizationNotFoundError)
  })
})
