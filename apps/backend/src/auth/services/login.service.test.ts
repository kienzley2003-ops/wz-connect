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
