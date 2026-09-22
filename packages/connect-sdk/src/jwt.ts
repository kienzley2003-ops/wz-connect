import { createHmac, timingSafeEqual } from 'node:crypto'
import { InvalidTokenError, TokenExpiredError } from './errors.js'

export interface AccessTokenPayload {
  sub: string
  org?: string
  role: string
  session: string
  products: string[]
  impersonatedBy?: string
  iat?: number
  exp?: number
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) {
    return false
  }
  return timingSafeEqual(bufA, bufB)
}

/**
 * Verifica localmente um access token emitido pelo wz-connect — sem
 * chamada de rede. É assim que os outros produtos do hub (wz-masterfila,
 * wz-desk, wz-orc, wz-agente) validam a sessão de um usuário a cada
 * request sem depender do Connect estar no ar (ver plano de divisão do
 * MVP, contrato do SDK).
 *
 * HS256 apenas — mesma regra do backend (ADR 0004, spec §5.4): um token
 * com `alg` diferente (incluindo `none`) é sempre rejeitado, nunca aceito
 * "no algoritmo que o token pedir".
 */
export function verifyAccessToken(secret: string, token: string): AccessTokenPayload {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new InvalidTokenError()
  }
  const [headerB64, payloadB64, signatureB64] = parts

  let header: { alg?: string }
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'))
  } catch {
    throw new InvalidTokenError()
  }
  if (header.alg !== 'HS256') {
    throw new InvalidTokenError()
  }

  const expectedSignature = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url')
  if (!safeEqual(signatureB64, expectedSignature)) {
    throw new InvalidTokenError()
  }

  let payload: AccessTokenPayload
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch {
    throw new InvalidTokenError()
  }

  if (typeof payload.exp === 'number' && Date.now() >= payload.exp * 1000) {
    throw new TokenExpiredError()
  }

  return payload
}
