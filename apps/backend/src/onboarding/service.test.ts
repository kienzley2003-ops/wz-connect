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
