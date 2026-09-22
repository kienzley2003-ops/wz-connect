import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server, type IncomingMessage } from 'node:http'
import { logAuditEvent } from './audit.js'
import { ConnectApiError } from './errors.js'

let server: Server
let baseUrl: string
let lastRequest: { method?: string; url?: string; headers: IncomingMessage['headers']; body: string } | null

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      lastRequest = { method: req.method, url: req.url, headers: req.headers, body }

      if (req.url === '/api/v1/audit' && req.headers.cookie?.includes('access_token=valido')) {
        res.writeHead(201, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ id: 'event-1' }))
        return
      }

      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { code: 'unauthenticated', message: 'Autenticação necessária' } }))
    })
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

describe('logAuditEvent', () => {
  it('envia o access token como cookie e o evento como JSON no corpo', async () => {
    await logAuditEvent({
      baseUrl,
      accessToken: 'valido',
      event: { product: 'masterfila', action: 'ticket.create', target: 'ticket-123' },
    })

    expect(lastRequest?.method).toBe('POST')
    expect(lastRequest?.url).toBe('/api/v1/audit')
    expect(lastRequest?.headers.cookie).toBe('access_token=valido')
    expect(JSON.parse(lastRequest!.body)).toEqual({
      product: 'masterfila',
      action: 'ticket.create',
      target: 'ticket-123',
    })
  })

  it('lança ConnectApiError com o código do backend quando a resposta não é 2xx', async () => {
    await expect(
      logAuditEvent({
        baseUrl,
        accessToken: 'invalido',
        event: { product: 'connect', action: 'x' },
      })
    ).rejects.toThrow(ConnectApiError)
  })
})
