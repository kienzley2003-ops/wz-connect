import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import fastifyJwt from '@fastify/jwt'
import { createTokenService } from './token.service.js'
import type { EntitlementsResolver } from '@wz/shared'

let app: FastifyInstance

beforeAll(async () => {
  app = Fastify()
  await app.register(fastifyJwt, {
    secret: 'segredo-de-teste-com-32-caracteres-no-minimo',
    sign: { algorithm: 'HS256', expiresIn: '15m' },
    verify: { algorithms: ['HS256'] },
  })
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

const entitlementsWithProducts: EntitlementsResolver = {
  async getActiveEntitlements(organizationId: string) {
    return { planId: 'pro', products: organizationId === 'org-1' ? ['masterfila', 'desk'] : [] }
  },
}

describe('signAccess / verifyAccess', () => {
  it('inclui products[] resolvido pelo EntitlementsResolver quando org está presente', async () => {
    const service = createTokenService(app.jwt, entitlementsWithProducts)
    const token = await service.signAccess({
      sub: 'user-1',
      org: 'org-1',
      role: 'owner',
      session: 'session-1',
    })
    const payload = service.verifyAccess(token)
    expect(payload.sub).toBe('user-1')
    expect(payload.org).toBe('org-1')
    expect(payload.role).toBe('owner')
    expect(payload.session).toBe('session-1')
    expect(payload.products).toEqual(['masterfila', 'desk'])
  })

  it('omite a claim org quando org é null (sessão de super_admin) e products fica vazio', async () => {
    const service = createTokenService(app.jwt, entitlementsWithProducts)
    const token = await service.signAccess({
      sub: 'admin-1',
      org: null,
      role: 'super_admin',
      session: 'session-2',
    })
    const payload = service.verifyAccess(token)
    expect(payload.org).toBeUndefined()
    expect(payload.products).toEqual([])
  })

  it('inclui impersonatedBy quando fornecido', async () => {
    const service = createTokenService(app.jwt, entitlementsWithProducts)
    const token = await service.signAccess({
      sub: 'admin-1',
      org: 'org-1',
      role: 'owner',
      session: 'session-2',
      impersonatedBy: 'master-1',
    })
    const payload = service.verifyAccess(token)
    expect(payload.impersonatedBy).toBe('master-1')
  })

  it('omite impersonatedBy quando não fornecido', async () => {
    const service = createTokenService(app.jwt, entitlementsWithProducts)
    const token = await service.signAccess({ sub: 'user-1', org: 'org-1', role: 'owner', session: 's1' })
    expect(service.verifyAccess(token).impersonatedBy).toBeUndefined()
  })
})

describe('mintRefresh', () => {
  it('retorna um token opaco e seu hash correspondente', () => {
    const service = createTokenService(app.jwt, entitlementsWithProducts)
    const { token, hash } = service.mintRefresh()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('gera um par diferente a cada chamada', () => {
    const service = createTokenService(app.jwt, entitlementsWithProducts)
    const a = service.mintRefresh()
    const b = service.mintRefresh()
    expect(a.token).not.toBe(b.token)
  })
})
