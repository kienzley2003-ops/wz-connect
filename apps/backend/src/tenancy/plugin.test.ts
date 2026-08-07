import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import Fastify from 'fastify'
import { createDb, type Db } from '../db/client.js'
import { organizations } from '../db/schema.js'
import { registerTenancyPlugin } from './plugin.js'
import { env } from '../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

async function buildApp() {
  const app = Fastify()
  await registerTenancyPlugin(app, db, { publicPaths: ['/public'] })
  app.get('/whoami', async (req) => ({ tenant: req.tenant }))
  app.get('/public', async (req) => ({ tenant: req.tenant }))
  await app.ready()
  return app
}

describe('registerTenancyPlugin', () => {
  it('resolve o tenant a partir do subdomínio do Host', async () => {
    await db.insert(organizations).values({ name: 'Acme', slug: 'acme' })
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/whoami', headers: { host: 'acme.wz-hub.com' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().tenant).toMatchObject({ slug: 'acme' })
    await app.close()
  })

  it('devolve tenant null no domínio apex (BASE_DOMAIN sem subdomínio) — Hub Admin', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/whoami', headers: { host: env.BASE_DOMAIN } })
    expect(res.statusCode).toBe(200)
    expect(res.json().tenant).toBeNull()
    await app.close()
  })

  it('retorna 400 tenant-not-found para um subdomínio desconhecido em rota não-pública', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { host: 'naoexiste.wz-hub.com' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('tenant-not-found')
    await app.close()
  })

  it('não resolve tenant em rotas públicas mesmo com subdomínio desconhecido', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/public',
      headers: { host: 'naoexiste.wz-hub.com' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().tenant).toBeNull()
    await app.close()
  })
})
