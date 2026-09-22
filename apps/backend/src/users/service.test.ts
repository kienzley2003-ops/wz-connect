import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../db/client.js'
import { users } from '../db/schema.js'
import { listUsers, setSuperAdmin } from './service.js'
import { UserNotFoundError } from '../lib/errors.js'
import { env } from '../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE users CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

describe('listUsers', () => {
  it('lista todos os usuários, mais recentes primeiro', async () => {
    await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' })
    await db.insert(users).values({ email: 'b@acme.com', passwordHash: 'x' })

    const rows = await listUsers(db)

    expect(rows).toHaveLength(2)
    expect(rows[0].email).toBe('b@acme.com')
  })
})

describe('setSuperAdmin', () => {
  it('promove um usuário a super admin', async () => {
    const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
    const updated = await setSuperAdmin(db, user.id, true)
    expect(updated.isSuperAdmin).toBe(true)
  })

  it('revoga o super admin', async () => {
    const [user] = await db
      .insert(users)
      .values({ email: 'a@acme.com', passwordHash: 'x', isSuperAdmin: true })
      .returning()
    const updated = await setSuperAdmin(db, user.id, false)
    expect(updated.isSuperAdmin).toBe(false)
  })

  it('lança UserNotFoundError quando o id não existe', async () => {
    await expect(
      setSuperAdmin(db, '00000000-0000-0000-0000-000000000000', true)
    ).rejects.toThrow(UserNotFoundError)
  })
})
