import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { eq, isNull, and, sql } from 'drizzle-orm'
import { createDb, type Db } from '../../db/client.js'
import { organizations, users, sessions, refreshTokens } from '../../db/schema.js'
import { createOrRotateSession, revokeSession, rotateRefreshToken } from './session.service.js'
import { hashRefreshToken } from '../lib/refresh-token.js'
import { env } from '../../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, users, sessions, refresh_tokens CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

async function seedUserAndOrg() {
  const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
  const [user] = await db.insert(users).values({ email: 'a@acme.com', passwordHash: 'x' }).returning()
  return { org, user }
}

describe('createOrRotateSession', () => {
  it('cria uma sessão nova e um refresh token com hash correto', async () => {
    const { org, user } = await seedUserAndOrg()
    const { sessionId, refreshToken } = await createOrRotateSession(db, user.id, org.id)

    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId))
    expect(session.revokedAt).toBeNull()
    expect(session.organizationId).toBe(org.id)

    const [storedRefresh] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.sessionId, sessionId))
    expect(storedRefresh.tokenHash).toBe(hashRefreshToken(refreshToken))
    expect(storedRefresh.revokedAt).toBeNull()
  })

  it('revoga a sessão anterior do mesmo (user, org) e seus refresh tokens ao criar uma nova', async () => {
    const { org, user } = await seedUserAndOrg()
    const first = await createOrRotateSession(db, user.id, org.id)
    const second = await createOrRotateSession(db, user.id, org.id)

    const [firstSession] = await db.select().from(sessions).where(eq(sessions.id, first.sessionId))
    expect(firstSession.revokedAt).not.toBeNull()

    const [firstRefresh] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.sessionId, first.sessionId))
    expect(firstRefresh.revokedAt).not.toBeNull()

    const [secondSession] = await db.select().from(sessions).where(eq(sessions.id, second.sessionId))
    expect(secondSession.revokedAt).toBeNull()
  })

  it('permite organizationId null (sessão de super_admin) sem violar constraint', async () => {
    const { user } = await seedUserAndOrg()
    const { sessionId } = await createOrRotateSession(db, user.id, null)
    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId))
    expect(session.organizationId).toBeNull()
  })

  it('trata organizationId null e um organizationId real como pares de sessão independentes', async () => {
    const { org, user } = await seedUserAndOrg()
    const hubSession = await createOrRotateSession(db, user.id, null)
    const orgSession = await createOrRotateSession(db, user.id, org.id)

    const [hub] = await db.select().from(sessions).where(eq(sessions.id, hubSession.sessionId))
    const [orgS] = await db.select().from(sessions).where(eq(sessions.id, orgSession.sessionId))
    expect(hub.revokedAt).toBeNull()
    expect(orgS.revokedAt).toBeNull()
  })

  it('não deixa mais de uma sessão ativa para o mesmo (user, org) depois da rotação', async () => {
    const { org, user } = await seedUserAndOrg()
    await createOrRotateSession(db, user.id, org.id)
    await createOrRotateSession(db, user.id, org.id)

    const active = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), eq(sessions.organizationId, org.id), isNull(sessions.revokedAt)))
    expect(active).toHaveLength(1)
  })
})

describe('revokeSession', () => {
  it('revoga a sessão e seu refresh token ativo', async () => {
    const { org, user } = await seedUserAndOrg()
    const { sessionId } = await createOrRotateSession(db, user.id, org.id)

    await revokeSession(db, sessionId)

    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId))
    expect(session.revokedAt).not.toBeNull()
    const [refresh] = await db.select().from(refreshTokens).where(eq(refreshTokens.sessionId, sessionId))
    expect(refresh.revokedAt).not.toBeNull()
  })
})

describe('rotateRefreshToken', () => {
  it('revoga o refresh token antigo e cria um novo para a mesma sessão, sem revogar a sessão', async () => {
    const { org, user } = await seedUserAndOrg()
    const { sessionId, refreshToken: oldToken } = await createOrRotateSession(db, user.id, org.id)

    const newToken = await rotateRefreshToken(db, sessionId, user.id)

    expect(newToken).not.toBe(oldToken)
    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId))
    expect(session.revokedAt).toBeNull()

    const rows = await db.select().from(refreshTokens).where(eq(refreshTokens.sessionId, sessionId))
    const active = rows.filter((r) => r.revokedAt === null)
    expect(active).toHaveLength(1)
    expect(active[0].tokenHash).toBe(hashRefreshToken(newToken))
  })
})
