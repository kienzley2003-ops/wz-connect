import type { FastifyInstance } from 'fastify'
import { eq, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { refreshTokens, sessions } from '../../db/schema.js'
import { hashRefreshToken } from '../lib/refresh-token.js'
import { revokeSession, rotateRefreshToken } from '../services/session.service.js'
import { resolveRole } from '../services/login.service.js'
import { createTokenService } from '../services/token.service.js'
import { stubEntitlementsResolver } from '../services/entitlements.service.js'
import { setAuthCookies } from '../lib/set-auth-cookies.js'
import { verifyCsrfToken } from '../services/csrf.service.js'
import { CsrfMismatchError, UnauthenticatedError, SessionRevokedError } from '../../lib/errors.js'

const REPLAY_WINDOW_SECONDS = 5

export async function registerRefreshRoute(app: FastifyInstance, db: Db): Promise<void> {
  const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)

  app.post('/api/v1/auth/refresh', async (request, reply) => {
    if (!verifyCsrfToken(request.headers['x-csrf-token'] as string | undefined, request.cookies.csrf)) {
      throw new CsrfMismatchError()
    }

    const token = request.cookies.refresh_token
    if (!token) {
      throw new UnauthenticatedError()
    }

    const [row] = await db
      .select({
        id: refreshTokens.id,
        userId: refreshTokens.userId,
        sessionId: refreshTokens.sessionId,
        revokedAt: refreshTokens.revokedAt,
        // Computed in Postgres, never compared against Date.now() — the app
        // server's clock and the DB server's clock are two different clocks
        // and can drift (observed ~30s drift between this Docker/WSL2
        // Postgres and the Windows host during development).
        withinReplayWindow: sql<boolean>`${refreshTokens.createdAt} > now() - interval '${sql.raw(String(REPLAY_WINDOW_SECONDS))} seconds'`,
      })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashRefreshToken(token)))
      .limit(1)
    if (!row) {
      throw new UnauthenticatedError()
    }

    if (row.revokedAt !== null) {
      if (row.withinReplayWindow) {
        await revokeSession(db, row.sessionId)
      }
      throw new SessionRevokedError()
    }

    const [session] = await db.select().from(sessions).where(eq(sessions.id, row.sessionId)).limit(1)
    if (!session || session.revokedAt !== null) {
      throw new SessionRevokedError()
    }

    const role = await resolveRole(db, row.userId, session.organizationId)
    const newRefreshToken = await rotateRefreshToken(db, session.id, row.userId)
    const access = await tokenService.signAccess({
      sub: row.userId,
      org: session.organizationId,
      role,
      session: session.id,
    })

    setAuthCookies(reply, { access, refresh: newRefreshToken, csrf: request.cookies.csrf ?? '' })
    return reply.send({ ok: true })
  })
}
