import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../db/client.js'
import { organizations } from '../db/schema.js'
import { listOrganizations, getOrganizationById } from './service.js'
import { OrganizationNotFoundError } from '../lib/errors.js'
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

describe('listOrganizations', () => {
  it('lista todas as organizações, mais recentes primeiro', async () => {
    await db.insert(organizations).values({ name: 'Acme', slug: 'acme' })
    await db.insert(organizations).values({ name: 'Beta', slug: 'beta' })

    const rows = await listOrganizations(db)

    expect(rows).toHaveLength(2)
    expect(rows[0].slug).toBe('beta')
  })
})

describe('getOrganizationById', () => {
  it('retorna a organização pelo id', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
    const row = await getOrganizationById(db, org.id)
    expect(row.slug).toBe('acme')
  })

  it('lança OrganizationNotFoundError quando o id não existe', async () => {
    await expect(
      getOrganizationById(db, '00000000-0000-0000-0000-000000000000')
    ).rejects.toThrow(OrganizationNotFoundError)
  })
})
