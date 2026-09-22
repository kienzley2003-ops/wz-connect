import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHmac } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { createConnectClient } from './index.js'
import { InvalidTokenError } from './errors.js'

const SECRET = 'um-segredo-de-teste-com-32-caracteres!!'

function signToken(secret: string, payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

describe('createConnectClient', () => {
  it('auth.verifyToken usa o jwtSecret configurado', () => {
    const client = createConnectClient({ baseUrl: 'http://localhost:3000', jwtSecret: SECRET })
    const token = signToken(SECRET, {
      sub: 'user-1',
      role: 'owner',
      session: 's1',
      products: [],
      exp: Math.floor(Date.now() / 1000) + 900,
    })

    expect(client.auth.verifyToken(token).sub).toBe('user-1')
  })

  it('auth.verifyToken rejeita token assinado com outro segredo', () => {
    const client = createConnectClient({ baseUrl: 'http://localhost:3000', jwtSecret: SECRET })
    const token = signToken('segredo-errado-completamente-diferente', {
      sub: 'user-1',
      role: 'owner',
      session: 's1',
      products: [],
      exp: Math.floor(Date.now() / 1000) + 900,
    })

    expect(() => client.auth.verifyToken(token)).toThrow(InvalidTokenError)
  })
})

describe('createConnectClient — auth.refresh e audit.log', () => {
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/api/v1/auth/refresh') {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': [
            'access_token=novo-access; Path=/',
            'refresh_token=novo-refresh; Path=/',
            'csrf=novo-csrf; Path=/',
          ] as unknown as string,
        })
        res.end(JSON.stringify({ ok: true }))
        return
      }
      if (req.url === '/api/v1/audit') {
        res.writeHead(201, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ id: 'event-1' }))
        return
      }
      res.writeHead(404)
      res.end()
    })
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') {
      throw new Error('failed to bind test server')
    }
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(() => {
    server.close()
  })

  it('auth.refresh chama o backend configurado e devolve o novo trio de tokens', async () => {
    const client = createConnectClient({ baseUrl, jwtSecret: SECRET })
    const result = await client.auth.refresh('refresh-antigo', 'csrf-atual')
    expect(result).toEqual({
      accessToken: 'novo-access',
      refreshToken: 'novo-refresh',
      csrfToken: 'novo-csrf',
    })
  })

  it('audit.log chama o backend configurado sem lançar', async () => {
    const client = createConnectClient({ baseUrl, jwtSecret: SECRET })
    await expect(
      client.audit.log('access-valido', { product: 'connect', action: 'x' })
    ).resolves.toBeUndefined()
  })
})
