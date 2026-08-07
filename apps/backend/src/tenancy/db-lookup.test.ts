import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../db/client.js'
import { organizations } from '../db/schema.js'
import { createDbOrgLookup } from './db-lookup.js'
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

describe('createDbOrgLookup', () => {
  it('encontra uma organização existente pelo slug', async () => {
    await db.insert(organizations).values({ name: 'Acme', slug: 'acme' })
    const lookup = createDbOrgLookup(db)
    const result = await lookup.findBySlug('acme')
    expect(result).toMatchObject({ slug: 'acme' })
    expect(result?.id).toBeTruthy()
  })

  it('retorna null quando o slug não existe', async () => {
    const lookup = createDbOrgLookup(db)
    expect(await lookup.findBySlug('naoexiste')).toBeNull()
  })
})
