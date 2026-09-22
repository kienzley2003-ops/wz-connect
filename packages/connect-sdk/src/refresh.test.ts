import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server, type IncomingMessage } from 'node:http'
import { refreshSession } from './refresh.js'
import { ConnectApiError } from './errors.js'

let server: Server
let baseUrl: string
let lastRequest: { method?: string; url?: string; headers: IncomingMessage['headers'] } | null

beforeAll(async () => {
  server = createServer((req, res) => {
    lastRequest = { method: req.method, url: req.url, headers: req.headers }

    if (req.url === '/api/v1/auth/refresh' && req.headers['x-csrf-token'] === 'csrf-sem-cookies') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    if (req.url === '/api/v1/auth/refresh' && req.headers['x-csrf-token'] === 'csrf-valido') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': [
          'access_token=novo-access; Path=/; HttpOnly; SameSite=Lax',
          'refresh_token=novo-refresh; Path=/; HttpOnly; SameSite=Lax',
          'csrf=novo-csrf; Path=/; SameSite=Lax',
        ] as unknown as string,
      })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    res.writeHead(403, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { code: 'csrf-mismatch', message: 'Token CSRF inválido' } }))
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

describe('refreshSession', () => {
  it('envia refresh_token/csrf como cookie e x-csrf-token como header, devolve o novo trio', async () => {
    const result = await refreshSession({
      baseUrl,
      refreshToken: 'refresh-antigo',
      csrfToken: 'csrf-valido',
    })

    expect(lastRequest?.method).toBe('POST')
    expect(lastRequest?.headers.cookie).toBe('refresh_token=refresh-antigo; csrf=csrf-valido')
    expect(result).toEqual({
      accessToken: 'novo-access',
      refreshToken: 'novo-refresh',
      csrfToken: 'novo-csrf',
    })
  })

  it('lança ConnectApiError quando o CSRF não confere', async () => {
    await expect(
      refreshSession({ baseUrl, refreshToken: 'refresh-antigo', csrfToken: 'csrf-errado' })
    ).rejects.toThrow(ConnectApiError)
  })

  it('lança ConnectApiError quando a resposta é 2xx mas sem os cookies esperados', async () => {
    await expect(
      refreshSession({ baseUrl, refreshToken: 'refresh-antigo', csrfToken: 'csrf-sem-cookies' })
    ).rejects.toThrow(ConnectApiError)
  })
})
