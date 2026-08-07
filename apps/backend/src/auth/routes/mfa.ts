import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { users } from '../../db/schema.js'
import { createRequireAuth } from '../hooks/require-auth.js'
import { stubEntitlementsResolver } from '../services/entitlements.service.js'
import { setupMfa, verifyMfaCode, encryptMfaSecret, decryptMfaSecret } from '../services/mfa.service.js'
import { MfaInvalidError, MfaNotEnrolledError } from '../../lib/errors.js'
import { env } from '../../env.js'

const EnableBody = z.object({ secret: z.string(), code: z.string().length(6) })
const DisableBody = z.object({ code: z.string().length(6) })

export async function registerMfaRoutes(app: FastifyInstance, db: Db): Promise<void> {
  const requireAuth = createRequireAuth(db, app.jwt, stubEntitlementsResolver)

  app.get('/api/v1/mfa/setup', { preHandler: requireAuth }, async (request) => {
    const [user] = await db.select().from(users).where(eq(users.id, request.authUser.sub)).limit(1)
    return setupMfa(user.email)
  })

  app.post('/api/v1/mfa/enable', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = EnableBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
    }
    if (!verifyMfaCode(parsed.data.secret, parsed.data.code)) {
      throw new MfaInvalidError()
    }
    const encrypted = encryptMfaSecret(parsed.data.secret, env.JWT_SECRET, request.authUser.sub)
    await db
      .update(users)
      .set({ mfaSecretEncrypted: encrypted, mfaEnabled: true })
      .where(eq(users.id, request.authUser.sub))
    return reply.send({ ok: true })
  })

  app.post('/api/v1/mfa/disable', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = DisableBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
    }
    const [user] = await db.select().from(users).where(eq(users.id, request.authUser.sub)).limit(1)
    if (!user.mfaEnabled || !user.mfaSecretEncrypted) {
      throw new MfaNotEnrolledError()
    }
    const secret = decryptMfaSecret(user.mfaSecretEncrypted, env.JWT_SECRET, user.id)
    if (!verifyMfaCode(secret, parsed.data.code)) {
      throw new MfaInvalidError()
    }
    await db.update(users).set({ mfaSecretEncrypted: null, mfaEnabled: false }).where(eq(users.id, user.id))
    return reply.send({ ok: true })
  })
}
