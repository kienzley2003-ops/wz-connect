import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../db/client.js'
import { organizations, users, memberships } from '../db/schema.js'
import { listMemberships, createMembership, updateMembership } from './service.js'
import { CrossOrgAccessError } from '../lib/errors.js'
import { env } from '../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, users, memberships CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

async function seedTwoOrgs() {
  const [orgA] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
  const [orgB] = await db.insert(organizations).values({ name: 'Beta', slug: 'beta' }).returning()
  const [userA] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
  const [membershipA] = await db
    .insert(memberships)
    .values({ userId: userA.id, organizationId: orgA.id, role: 'owner' })
    .returning()
  return { orgA, orgB, userA, membershipA }
}

describe('listMemberships', () => {
  it('lista só as memberships da organização informada', async () => {
    const { orgA, membershipA } = await seedTwoOrgs()
    const rows = await listMemberships(db, orgA.id)
    expect(rows.map((r) => r.id)).toEqual([membershipA.id])
  })

  it('inclui o e-mail do usuário via join', async () => {
    const { orgA, userA } = await seedTwoOrgs()
    const rows = await listMemberships(db, orgA.id)
    expect(rows[0].email).toBe(userA.email)
  })
})

describe('createMembership', () => {
  it('cria uma membership ativa para um usuário existente', async () => {
    const { orgA } = await seedTwoOrgs()
    const [newUser] = await db.insert(users).values({ email: 'b@acme.com', passwordHash: 'x' }).returning()

    const membership = await createMembership(db, orgA.id, newUser.id, 'admin')

    expect(membership.role).toBe('admin')
    expect(membership.status).toBe('active')
  })
})

describe('updateMembership', () => {
  it('atualiza o role quando a membership pertence à org informada', async () => {
    const { orgA, membershipA } = await seedTwoOrgs()
    const updated = await updateMembership(db, orgA.id, membershipA.id, { role: 'admin' })
    expect(updated.role).toBe('admin')
  })

  it('atualiza o status (ex.: suspender um membro)', async () => {
    const { orgA, membershipA } = await seedTwoOrgs()
    const updated = await updateMembership(db, orgA.id, membershipA.id, { status: 'suspended' })
    expect(updated.status).toBe('suspended')
    expect(updated.role).toBe('owner')
  })

  it('lança CrossOrgAccessError quando a membership pertence a outra org', async () => {
    const { orgB, membershipA } = await seedTwoOrgs()
    await expect(updateMembership(db, orgB.id, membershipA.id, { role: 'admin' })).rejects.toThrow(
      CrossOrgAccessError
    )
  })
})
