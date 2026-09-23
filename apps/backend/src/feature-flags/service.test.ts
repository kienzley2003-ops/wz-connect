import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../db/client.js'
import { organizations, featureFlags } from '../db/schema.js'
import { listFeatureFlags, setFeatureFlag, getFeatureFlag } from './service.js'
import { env } from '../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, feature_flags CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

describe('setFeatureFlag', () => {
  it('cria o flag na primeira vez', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const flag = await setFeatureFlag(db, org.id, 'beta-dashboard', true)
    expect(flag.enabled).toBe(true)
    expect(flag.key).toBe('beta-dashboard')
  })

  it('atualiza (upsert) em vez de duplicar quando a key já existe pra org', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    await setFeatureFlag(db, org.id, 'beta-dashboard', true)
    await setFeatureFlag(db, org.id, 'beta-dashboard', false)

    const rows = await db.select().from(featureFlags).where(sql`organization_id = ${org.id}`)
    expect(rows).toHaveLength(1)
    expect(rows[0].enabled).toBe(false)
  })
})

describe('listFeatureFlags', () => {
  it('lista só os flags da organização informada', async () => {
    const [orgA] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const [orgB] = await db.insert(organizations).values({ name: 'Beta', slug: 'beta' }).returning()
    await setFeatureFlag(db, orgA.id, 'beta-dashboard', true)
    await setFeatureFlag(db, orgB.id, 'beta-dashboard', true)

    const rows = await listFeatureFlags(db, orgA.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].organizationId).toBe(orgA.id)
  })
})

describe('getFeatureFlag', () => {
  it('retorna false quando o flag nunca foi setado pra essa org', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    expect(await getFeatureFlag(db, org.id, 'inexistente')).toBe(false)
  })

  it('retorna o valor setado', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    await setFeatureFlag(db, org.id, 'beta-dashboard', true)
    expect(await getFeatureFlag(db, org.id, 'beta-dashboard')).toBe(true)
  })
})
