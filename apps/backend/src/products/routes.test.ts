import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../db/client.js'
import { users, products } from '../db/schema.js'
import { createOrRotateSession } from '../auth/services/session.service.js'
import { createTokenService } from '../auth/services/token.service.js'
import { stubEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { registerProductsRoutes } from './routes.js'
import { buildTestApp } from '../test-utils/build-app.js'
import { env } from '../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE users, products, sessions CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

async function seedSuperAdminSession() {
  const [superAdmin] = await db
    .insert(users)
    .values({ email: 'root@wz.com', passwordHash: 'x', isSuperAdmin: true })
    .returning()
  const { sessionId } = await createOrRotateSession(db, superAdmin.id, null)
  return { superAdmin, sessionId }
}

describe('GET /api/v1/products', () => {
  it('qualquer usuário autenticado pode listar: 200', async () => {
    await db.insert(products).values({ key: 'masterfila', name: 'Master Fila' })
    const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
    const { sessionId } = await createOrRotateSession(db, user.id, null)
    const app = await buildTestApp(db, (a) => registerProductsRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: null, role: 'viewer', session: sessionId })

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/products',
      headers: { host: env.BASE_DOMAIN },
      cookies: { access_token: access },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
    await app.close()
  })
})

describe('POST /api/v1/products', () => {
  it('super_admin cria um produto: 201', async () => {
    const { superAdmin, sessionId } = await seedSuperAdminSession()
    const app = await buildTestApp(db, (a) => registerProductsRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: superAdmin.id, org: null, role: 'super_admin', session: sessionId })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: { host: env.BASE_DOMAIN },
      cookies: { access_token: access },
      payload: { key: 'masterfila', name: 'Master Fila' },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().key).toBe('masterfila')
    await app.close()
  })

  it('rejeita com 403 quando o requester não é super_admin', async () => {
    const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
    const { sessionId } = await createOrRotateSession(db, user.id, null)
    const app = await buildTestApp(db, (a) => registerProductsRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: user.id, org: null, role: 'viewer', session: sessionId })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: { host: env.BASE_DOMAIN },
      cookies: { access_token: access },
      payload: { key: 'masterfila', name: 'Master Fila' },
    })

    expect(res.statusCode).toBe(403)
    await app.close()
  })

  it('rejeita com 409 quando a key já existe', async () => {
    const { superAdmin, sessionId } = await seedSuperAdminSession()
    await db.insert(products).values({ key: 'masterfila', name: 'Master Fila' })
    const app = await buildTestApp(db, (a) => registerProductsRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: superAdmin.id, org: null, role: 'super_admin', session: sessionId })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: { host: env.BASE_DOMAIN },
      cookies: { access_token: access },
      payload: { key: 'masterfila', name: 'Outro nome' },
    })

    expect(res.statusCode).toBe(409)
    await app.close()
  })
})

describe('PUT /api/v1/products/:id', () => {
  it('super_admin atualiza um produto: 200', async () => {
    const { superAdmin, sessionId } = await seedSuperAdminSession()
    const [product] = await db.insert(products).values({ key: 'masterfila', name: 'Master Fila' }).returning()
    const app = await buildTestApp(db, (a) => registerProductsRoutes(a, db))
    const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)
    const access = await tokenService.signAccess({ sub: superAdmin.id, org: null, role: 'super_admin', session: sessionId })

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/products/${product.id}`,
      headers: { host: env.BASE_DOMAIN },
      cookies: { access_token: access },
      payload: { active: false },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().active).toBe(false)
    await app.close()
  })
})
