import type { EntitlementsResolver } from '@wz/shared'
import { generateRefreshToken, hashRefreshToken } from '../lib/refresh-token.js'

export interface JwtSigner {
  sign(payload: Record<string, unknown>, options?: { expiresIn?: string }): string
  verify<T = Record<string, unknown>>(token: string, options?: { algorithms?: string[] }): T
}

export interface AccessTokenPayload {
  sub: string
  org?: string
  role: string
  session: string
  products: string[]
  impersonatedBy?: string
}

export interface SignAccessParams {
  sub: string
  org: string | null
  role: string
  session: string
  impersonatedBy?: string
}

export function createTokenService(jwt: JwtSigner, entitlements: EntitlementsResolver) {
  return {
    async signAccess(params: SignAccessParams): Promise<string> {
      const products = params.org
        ? (await entitlements.getActiveEntitlements(params.org)).products
        : []
      const payload: Record<string, unknown> = {
        sub: params.sub,
        role: params.role,
        session: params.session,
        products,
      }
      if (params.org) {
        payload.org = params.org
      }
      if (params.impersonatedBy) {
        payload.impersonatedBy = params.impersonatedBy
      }
      return jwt.sign(payload, { expiresIn: '15m' })
    },

    verifyAccess(token: string): AccessTokenPayload {
      return jwt.verify<AccessTokenPayload>(token, { algorithms: ['HS256'] })
    },

    mintRefresh(): { token: string; hash: string } {
      const token = generateRefreshToken()
      return { token, hash: hashRefreshToken(token) }
    },
  }
}
