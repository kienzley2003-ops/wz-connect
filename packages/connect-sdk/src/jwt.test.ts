import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyAccessToken, type AccessTokenPayload } from './jwt.js'
import { InvalidTokenError, TokenExpiredError } from './errors.js'

const SECRET = 'um-segredo-de-teste-com-32-caracteres!!'

function signToken(
  secret: string,
  payload: AccessTokenPayload,
  header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' }
): string {
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url')
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest('base64url')
  return `${headerB64}.${payloadB64}.${signature}`
}

function basePayload(overrides: Partial<AccessTokenPayload> = {}): AccessTokenPayload {
  return {
    sub: 'user-1',
    org: 'org-1',
    role: 'owner',
    session: 'session-1',
    products: [],
    exp: Math.floor(Date.now() / 1000) + 900,
    ...overrides,
  }
}

describe('verifyAccessToken', () => {
  it('retorna o payload de um token válido assinado com o mesmo segredo', () => {
    const token = signToken(SECRET, basePayload())
    const payload = verifyAccessToken(SECRET, token)
    expect(payload.sub).toBe('user-1')
    expect(payload.role).toBe('owner')
  })

  it('lança InvalidTokenError quando o segredo não confere', () => {
    const token = signToken(SECRET, basePayload())
    expect(() => verifyAccessToken('outro-segredo-completamente-diferente!!', token)).toThrow(
      InvalidTokenError
    )
  })

  it('lança InvalidTokenError quando o payload foi adulterado (assinatura não bate mais)', () => {
    const token = signToken(SECRET, basePayload())
    const [header, payload, signature] = token.split('.')
    const tamperedPayload = Buffer.from(JSON.stringify(basePayload({ role: 'super_admin' }))).toString(
      'base64url'
    )
    expect(() => verifyAccessToken(SECRET, `${header}.${tamperedPayload}.${signature}`)).toThrow(
      InvalidTokenError
    )
  })

  it('lança InvalidTokenError para um token com formato inválido (não são 3 partes)', () => {
    expect(() => verifyAccessToken(SECRET, 'nao-eh-um-jwt')).toThrow(InvalidTokenError)
  })

  it('lança InvalidTokenError quando o algoritmo não é HS256 (inclusive "none")', () => {
    const token = signToken(SECRET, basePayload(), { alg: 'none', typ: 'JWT' })
    expect(() => verifyAccessToken(SECRET, token)).toThrow(InvalidTokenError)
  })

  it('lança TokenExpiredError quando exp já passou', () => {
    const token = signToken(SECRET, basePayload({ exp: Math.floor(Date.now() / 1000) - 60 }))
    expect(() => verifyAccessToken(SECRET, token)).toThrow(TokenExpiredError)
  })

  it('lança InvalidTokenError quando o header não é um JSON válido', () => {
    const garbledHeader = Buffer.from('nao-eh-json').toString('base64url')
    const payloadB64 = Buffer.from(JSON.stringify(basePayload())).toString('base64url')
    const signature = createHmac('sha256', SECRET)
      .update(`${garbledHeader}.${payloadB64}`)
      .digest('base64url')
    expect(() => verifyAccessToken(SECRET, `${garbledHeader}.${payloadB64}.${signature}`)).toThrow(
      InvalidTokenError
    )
  })

  it('lança InvalidTokenError quando o payload não é um JSON válido (mas a assinatura bate)', () => {
    const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const garbledPayload = Buffer.from('nao-eh-json').toString('base64url')
    const signature = createHmac('sha256', SECRET)
      .update(`${headerB64}.${garbledPayload}`)
      .digest('base64url')
    expect(() => verifyAccessToken(SECRET, `${headerB64}.${garbledPayload}.${signature}`)).toThrow(
      InvalidTokenError
    )
  })
})
