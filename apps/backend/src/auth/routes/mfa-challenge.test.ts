import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, eq } from 'drizzle-orm'
import { createDb, type Db } from '../../db/client.js'
import { organizations, users, memberships } from '../../db/schema.js'
import { setupMfa, encryptMfaSecret } from '../services/mfa.service.js'
import { totp } from '../lib/totp.js'
import { registerMfaChallengeRoute } from './mfa-challenge.js'
import { buildTestApp } from '../../test-utils/build-app.js'
import { env } from '../../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE organizations, users, memberships CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

async function seedMfaUser() {
  const { secret } = setupMfa('mfa@acme.com')
  const [org] = await db.insert(organizations).values({ name: 'Acme', slug: 'acme' }).returning()
  const [user] = await db
    .insert(users)
    .values({
      email: 'mfa@acme.com',
      passwordHash: 'x',
      mfaEnabled: true,
      mfaSecretEncrypted: '',
    })
    .returning()
  const encrypted = encryptMfaSecret(secret, env.JWT_SECRET, user.id)
  await db.update(users).set({ mfaSecretEncrypted: encrypted }).where(eq(users.id, user.id))
  await db.insert(memberships).values({ userId: user.id, organizationId: org.id, role: 'owner' })
  return { org, user, secret }
}

async function signChallenge(app: Awaited<ReturnType<typeof buildTestApp>>, sub: string, org: string) {
  return app.jwt.sign({ sub, org, purpose: 'mfa' }, { expiresIn: '60s' })
}

describe('POST /api/v1/auth/mfa', () => {
  it('completa o login com o código TOTP correto: 200 + cookies', async () => {
    const { org, user, secret } = await seedMfaUser()
    const app = await buildTestApp(db, (a) => registerMfaChallengeRoute(a, db))
    const mfaChallenge = await signChallenge(app, user.id, org.id)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa',
      payload: { mfaChallenge, code: totp(secret) },
    })

    expect(res.statusCode).toBe(200)
    expect(res.cookies.map((c) => c.name)).toEqual(
      expect.arrayContaining(['access_token', 'refresh_token', 'csrf'])
    )
    await app.close()
  })

  it('rejeita um código TOTP incorreto com 401 mfa-invalid', async () => {
    const { org, user } = await seedMfaUser()
    const app = await buildTestApp(db, (a) => registerMfaChallengeRoute(a, db))
    const mfaChallenge = await signChallenge(app, user.id, org.id)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa',
      payload: { mfaChallenge, code: '000000' },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('mfa-invalid')
    await app.close()
  })

  it('rejeita um challenge token inválido/expirado com 401', async () => {
    const app = await buildTestApp(db, (a) => registerMfaChallengeRoute(a, db))
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa',
      payload: { mfaChallenge: 'token-invalido', code: '123456' },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })
})
