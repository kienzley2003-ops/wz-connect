import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { users } from '../../db/schema.js'
import { verifyPassword } from '../services/password.service.js'
import { isLocked, recordFailure, recordSuccess } from '../services/lockout.service.js'
import { resolveRole, completeLogin } from '../services/login.service.js'
import { createTokenService } from '../services/token.service.js'
import { stubEntitlementsResolver } from '../services/entitlements.service.js'
import { setAuthCookies } from '../lib/set-auth-cookies.js'
import { InvalidCredentialsError, LockedAccountError } from '../../lib/errors.js'

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function registerLoginRoute(app: FastifyInstance, db: Db): Promise<void> {
  const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)

  app.post(
    '/api/v1/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = LoginBody.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
      }
      const { email, password } = parsed.data

      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
      if (!user) {
        throw new InvalidCredentialsError()
      }

      if (isLocked({ failedLoginCount: user.failedLoginCount, lockedUntil: user.lockedUntil })) {
        throw new LockedAccountError(user.lockedUntil!)
      }

      const passwordOk = await verifyPassword(password, user.passwordHash)
      if (!passwordOk) {
        const next = recordFailure({ failedLoginCount: user.failedLoginCount, lockedUntil: user.lockedUntil })
        await db
          .update(users)
          .set({ failedLoginCount: next.failedLoginCount, lockedUntil: next.lockedUntil })
          .where(eq(users.id, user.id))
        throw new InvalidCredentialsError()
      }

      const reset = recordSuccess()
      await db
        .update(users)
        .set({ failedLoginCount: reset.failedLoginCount, lockedUntil: reset.lockedUntil })
        .where(eq(users.id, user.id))

      const organizationId = request.tenant?.id ?? null

      if (user.mfaEnabled) {
        const mfaChallenge = app.jwt.sign(
          { sub: user.id, org: organizationId ?? undefined, purpose: 'mfa' },
          { expiresIn: '60s' }
        )
        return reply.send({ mfaChallenge })
      }

      const role = await resolveRole(db, user.id, organizationId)
      const tokens = await completeLogin(db, tokenService, user.id, organizationId, role)
      setAuthCookies(reply, tokens)
      return reply.send({ user: { id: user.id, email: user.email }, role })
    }
  )
}
