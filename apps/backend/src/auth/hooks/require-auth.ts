import { eq } from 'drizzle-orm'
import type { FastifyRequest } from 'fastify'
import type { Db } from '../../db/client.js'
import { sessions } from '../../db/schema.js'
import type { EntitlementsResolver } from '@wz/shared'
import { createTokenService, type AccessTokenPayload, type JwtSigner } from '../services/token.service.js'
import { UnauthenticatedError, SessionRevokedError } from '../../lib/errors.js'

declare module 'fastify' {
  interface FastifyRequest {
    authUser: AccessTokenPayload
  }
}

export function createRequireAuth(db: Db, jwt: JwtSigner, entitlements: EntitlementsResolver) {
  const tokenService = createTokenService(jwt, entitlements)

  return async (request: FastifyRequest): Promise<void> => {
    const token = request.cookies?.access_token
    if (!token) {
      throw new UnauthenticatedError()
    }

    let payload: AccessTokenPayload
    try {
      payload = tokenService.verifyAccess(token)
    } catch {
      throw new UnauthenticatedError()
    }

    const [session] = await db
      .select({ revokedAt: sessions.revokedAt })
      .from(sessions)
      .where(eq(sessions.id, payload.session))
      .limit(1)

    if (!session || session.revokedAt !== null) {
      throw new SessionRevokedError()
    }

    request.authUser = payload
  }
}
