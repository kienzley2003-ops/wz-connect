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
