import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server, type IncomingMessage } from 'node:http'
import { getActiveEntitlements, checkEntitlement } from './entitlements.js'
import { ConnectApiError } from './errors.js'

let server: Server
let baseUrl: string
let lastRequest: { url?: string; headers: IncomingMessage['headers'] } | null

beforeAll(async () => {
  server = createServer((req, res) => {
    lastRequest = { url: req.url, headers: req.headers }
    const authorized = req.headers.cookie?.includes('access_token=valido')

    if (req.url?.startsWith('/api/v1/entitlements/check')) {
      if (!authorized) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { code: 'unauthenticated', message: 'Autenticação necessária' } }))
        return
      }
      const url = new URL(req.url, 'http://localhost')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ allowed: url.searchParams.get('product') === 'masterfila' }))
      return
    }

    if (req.url?.startsWith('/api/v1/entitlements')) {
      if (!authorized) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { code: 'unauthenticated', message: 'Autenticação necessária' } }))
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ planId: 'plan-1', products: ['masterfila'] }))
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

describe('getActiveEntitlements', () => {
  it('envia organizationId como query param e o access token como cookie', async () => {
    const result = await getActiveEntitlements({ baseUrl, accessToken: 'valido', organizationId: 'org-1' })

    expect(lastRequest?.url).toBe('/api/v1/entitlements?organizationId=org-1')
    expect(lastRequest?.headers.cookie).toBe('access_token=valido')
    expect(result).toEqual({ planId: 'plan-1', products: ['masterfila'] })
  })

  it('lança ConnectApiError com o código do backend quando a resposta não é 2xx', async () => {
    await expect(
      getActiveEntitlements({ baseUrl, accessToken: 'invalido', organizationId: 'org-1' })
    ).rejects.toThrow(ConnectApiError)
  })
})

describe('checkEntitlement', () => {
  it('retorna allowed=true quando o produto está no plano ativo', async () => {
    const allowed = await checkEntitlement({
      baseUrl,
      accessToken: 'valido',
      organizationId: 'org-1',
      product: 'masterfila',
    })

    expect(lastRequest?.url).toBe('/api/v1/entitlements/check?organizationId=org-1&product=masterfila')
    expect(allowed).toBe(true)
  })

  it('retorna allowed=false para um produto fora do plano', async () => {
    const allowed = await checkEntitlement({
      baseUrl,
      accessToken: 'valido',
      organizationId: 'org-1',
      product: 'desk',
    })

    expect(allowed).toBe(false)
  })

  it('lança ConnectApiError quando a resposta não é 2xx', async () => {
    await expect(
      checkEntitlement({ baseUrl, accessToken: 'invalido', organizationId: 'org-1', product: 'desk' })
    ).rejects.toThrow(ConnectApiError)
  })
})
