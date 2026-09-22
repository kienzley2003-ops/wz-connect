import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, eq } from 'drizzle-orm'
import { createDb, type Db } from '../db/client.js'
import { organizations, users, auditEvents } from '../db/schema.js'
import { logAuditEvent, listAuditEvents } from './service.js'
import { env } from '../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, users, audit_events CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

async function seedOrgAndUser() {
  const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
  const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
  return { org, user }
}

describe('logAuditEvent', () => {
  it('grava um evento com organizationId, actorId, product e action', async () => {
    const { org, user } = await seedOrgAndUser()

    const event = await logAuditEvent(db, {
      organizationId: org.id,
      actorId: user.id,
      product: 'connect',
      action: 'auth.login',
    })

    expect(event.id).toBeTruthy()
    const [row] = await db.select().from(auditEvents).where(eq(auditEvents.id, event.id))
    expect(row.organizationId).toBe(org.id)
    expect(row.actorId).toBe(user.id)
    expect(row.product).toBe('connect')
    expect(row.action).toBe('auth.login')
  })

  it('aceita organizationId null para eventos globais do hub', async () => {
    const { user } = await seedOrgAndUser()
    const event = await logAuditEvent(db, {
      organizationId: null,
      actorId: user.id,
      product: 'connect',
      action: 'plan.create',
    })
    expect(event.organizationId).toBeNull()
  })

  it('grava impersonatedBy quando presente', async () => {
    const { org, user } = await seedOrgAndUser()
    const event = await logAuditEvent(db, {
      organizationId: org.id,
      actorId: user.id,
      impersonatedBy: user.id,
      product: 'connect',
      action: 'impersonation.start',
    })
    expect(event.impersonatedBy).toBe(user.id)
  })
})

describe('listAuditEvents', () => {
  it('filtra por organizationId', async () => {
    const { org, user } = await seedOrgAndUser()
    const [orgB] = await db.insert(organizations).values({ name: 'Beta', slug: 'beta' }).returning()
    await logAuditEvent(db, { organizationId: org.id, actorId: user.id, product: 'connect', action: 'a' })
    await logAuditEvent(db, { organizationId: orgB.id, actorId: user.id, product: 'connect', action: 'b' })

    const rows = await listAuditEvents(db, { organizationId: org.id })
    expect(rows).toHaveLength(1)
    expect(rows[0].organizationId).toBe(org.id)
  })

  it('filtra por product', async () => {
    const { org, user } = await seedOrgAndUser()
    await logAuditEvent(db, { organizationId: org.id, actorId: user.id, product: 'connect', action: 'a' })
    await logAuditEvent(db, { organizationId: org.id, actorId: user.id, product: 'masterfila', action: 'b' })

    const rows = await listAuditEvents(db, { product: 'masterfila' })
    expect(rows).toHaveLength(1)
    expect(rows[0].product).toBe('masterfila')
  })

  it('retorna todos os eventos quando nenhum filtro é informado, mais recentes primeiro', async () => {
    const { org, user } = await seedOrgAndUser()
    await logAuditEvent(db, { organizationId: org.id, actorId: user.id, product: 'connect', action: 'first' })
    await logAuditEvent(db, { organizationId: org.id, actorId: user.id, product: 'connect', action: 'second' })

    const rows = await listAuditEvents(db, {})
    expect(rows).toHaveLength(2)
    expect(rows[0].action).toBe('second')
  })
})
