import { ConnectApiError } from './errors.js'

export interface RefreshParams {
  baseUrl: string
  refreshToken: string
  csrfToken: string
}

export interface RefreshResult {
  accessToken: string
  refreshToken: string
  csrfToken: string
}

function parseCookieValue(setCookieHeader: string, name: string): string | undefined {
  const match = setCookieHeader.match(new RegExp(`^${name}=([^;]*)`))
  return match?.[1]
}

/**
 * Rotaciona a sessão via POST /auth/refresh do Connect (refresh token
 * rotativo — ADR 0004) e devolve o novo trio de tokens para o produto
 * consumidor guardar. O Connect valida por cookie + header x-csrf-token
 * (ver auth/routes/refresh.ts), não por Authorization — por isso os
 * tokens de entrada e saída aqui são os valores crus dos cookies, não um
 * Bearer token.
 */
export async function refreshSession(params: RefreshParams): Promise<RefreshResult> {
  const res = await fetch(`${params.baseUrl}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: {
      Cookie: `refresh_token=${params.refreshToken}; csrf=${params.csrfToken}`,
      'x-csrf-token': params.csrfToken,
    },
  })

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null
    throw new ConnectApiError(
      res.status,
      data?.error?.code ?? 'unknown',
      data?.error?.message ?? 'Falha ao renovar sessão'
    )
  }

  const setCookieHeaders = res.headers.getSetCookie?.() ?? []
  const accessToken = setCookieHeaders
    .map((h) => parseCookieValue(h, 'access_token'))
    .find((v): v is string => Boolean(v))
  const refreshToken = setCookieHeaders
    .map((h) => parseCookieValue(h, 'refresh_token'))
    .find((v): v is string => Boolean(v))
  const csrfToken = setCookieHeaders
    .map((h) => parseCookieValue(h, 'csrf'))
    .find((v): v is string => Boolean(v))

  if (!accessToken || !refreshToken || !csrfToken) {
    throw new ConnectApiError(500, 'invalid-response', 'Resposta de refresh sem os cookies esperados')
  }

  return { accessToken, refreshToken, csrfToken }
}
