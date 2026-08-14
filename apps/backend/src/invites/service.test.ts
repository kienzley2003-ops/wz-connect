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
