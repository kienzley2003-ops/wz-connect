import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { users } from '../../db/schema.js'
import { decryptMfaSecret, verifyMfaCode } from '../services/mfa.service.js'
import { resolveRole, completeLogin } from '../services/login.service.js'
import { createTokenService } from '../services/token.service.js'
import { stubEntitlementsResolver } from '../services/entitlements.service.js'
import { setAuthCookies } from '../lib/set-auth-cookies.js'
import { UnauthenticatedError, MfaNotEnrolledError, MfaInvalidError } from '../../lib/errors.js'
import { env } from '../../env.js'

const MfaChallengeBody = z.object({
  mfaChallenge: z.string(),
  code: z.string().length(6),
})

interface MfaChallengePayload {
  sub: string
  org?: string
  purpose: string
}

export async function registerMfaChallengeRoute(app: FastifyInstance, db: Db): Promise<void> {
  const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)

  app.post('/api/v1/auth/mfa', async (request, reply) => {
    const parsed = MfaChallengeBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
    }

    let payload: MfaChallengePayload
    try {
      payload = app.jwt.verify<MfaChallengePayload>(parsed.data.mfaChallenge, { algorithms: ['HS256'] })
    } catch {
      throw new UnauthenticatedError()
    }
    if (payload.purpose !== 'mfa') {
      throw new UnauthenticatedError()
    }

    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1)
    if (!user || !user.mfaSecretEncrypted) {
      throw new MfaNotEnrolledError()
    }

    const secret = decryptMfaSecret(user.mfaSecretEncrypted, env.JWT_SECRET, user.id)
    if (!verifyMfaCode(secret, parsed.data.code)) {
      throw new MfaInvalidError()
    }

    const organizationId = payload.org ?? null
    const role = await resolveRole(db, user.id, organizationId)
    const tokens = await completeLogin(db, tokenService, user.id, organizationId, role)
    setAuthCookies(reply, tokens)
    return reply.send({ user: { id: user.id, email: user.email }, role })
  })
}
