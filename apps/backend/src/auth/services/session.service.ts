import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { sessions, refreshTokens } from '../../db/schema.js'
import { generateRefreshToken, hashRefreshToken } from '../lib/refresh-token.js'

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000

export async function createOrRotateSession(
  db: Db,
  userId: string,
  organizationId: string | null
): Promise<{ sessionId: string; refreshToken: string }> {
  return db.transaction(
    async (tx) => {
      const orgCondition =
        organizationId === null
          ? isNull(sessions.organizationId)
          : eq(sessions.organizationId, organizationId)

      const previousSessions = await tx
        .select({ id: sessions.id })
        .from(sessions)
        .where(and(eq(sessions.userId, userId), orgCondition, isNull(sessions.revokedAt)))

      for (const previous of previousSessions) {
        await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, previous.id))
        await tx
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(and(eq(refreshTokens.sessionId, previous.id), isNull(refreshTokens.revokedAt)))
      }

      const [session] = await tx
        .insert(sessions)
        .values({ userId, organizationId })
        .returning({ id: sessions.id })

      const refreshTokenPlain = generateRefreshToken()
      await tx.insert(refreshTokens).values({
        userId,
        sessionId: session.id,
        tokenHash: hashRefreshToken(refreshTokenPlain),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      })

      return { sessionId: session.id, refreshToken: refreshTokenPlain }
    },
    { isolationLevel: 'serializable' }
  )
}

export async function revokeSession(db: Db, sessionId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId))
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.sessionId, sessionId), isNull(refreshTokens.revokedAt)))
  })
}

export async function rotateRefreshToken(db: Db, sessionId: string, userId: string): Promise<string> {
  return db.transaction(async (tx) => {
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.sessionId, sessionId), isNull(refreshTokens.revokedAt)))

    const refreshTokenPlain = generateRefreshToken()
    await tx.insert(refreshTokens).values({
      userId,
      sessionId,
      tokenHash: hashRefreshToken(refreshTokenPlain),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    })
    return refreshTokenPlain
  })
}
