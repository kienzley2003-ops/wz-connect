import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../db/client.js'
import { createTokenService } from '../auth/services/token.service.js'
import { stubEntitlementsResolver } from '../auth/services/entitlements.service.js'
import { setAuthCookies } from '../auth/lib/set-auth-cookies.js'
import { onboardOrganization } from './service.js'

const OnboardBody = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9-]+$/),
  cnpj: z.string().optional(),
  billing_email: z.string().email(),
  admin: z.object({ email: z.string().email(), password: z.string().min(8) }),
})

export async function registerOnboardingRoute(app: FastifyInstance, db: Db): Promise<void> {
  const tokenService = createTokenService(app.jwt, stubEntitlementsResolver)

  app.post('/api/v1/onboarding/organization', async (request, reply) => {
    const parsed = OnboardBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'validation-error', message: 'Dados inválidos' } })
    }
    const result = await onboardOrganization(db, tokenService, {
      name: parsed.data.name,
      slug: parsed.data.slug,
      cnpj: parsed.data.cnpj,
      billingEmail: parsed.data.billing_email,
      admin: parsed.data.admin,
    })
    setAuthCookies(reply, { access: result.access, refresh: result.refresh, csrf: result.csrf })
    return reply.status(201).send({ organizationId: result.organizationId, userId: result.userId })
  })
}
