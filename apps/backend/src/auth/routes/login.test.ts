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
