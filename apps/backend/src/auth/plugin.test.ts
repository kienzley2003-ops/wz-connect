import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import { registerAuthPlugin } from './plugin.js'

describe('registerAuthPlugin', () => {
  it('decora a instância com jwt.sign/jwt.verify usando HS256', async () => {
    const app = Fastify()
    await registerAuthPlugin(app)
    await app.ready()

    const token = app.jwt.sign({ sub: 'user-1' })
    const decoded = app.jwt.verify<{ sub: string }>(token)
    expect(decoded.sub).toBe('user-1')

    await app.close()
  })

  it('rejeita um token adulterado (assinatura não confere)', async () => {
    const app = Fastify()
    await registerAuthPlugin(app)
    await app.ready()

    const token = app.jwt.sign({ sub: 'user-1' })
    const tampered = token.slice(0, -4) + 'xxxx'
    expect(() => app.jwt.verify(tampered)).toThrow()

    await app.close()
  })

  it('registra o plugin de cookies (decorator parseCookie disponível)', async () => {
    const app = Fastify()
    await registerAuthPlugin(app)
    await app.ready()
    expect(typeof app.parseCookie).toBe('function')
    await app.close()
  })
})
