import { ConnectApiError } from './errors.js'

export interface EntitlementsResult {
  planId: string | null
  products: string[]
}

interface EntitlementsRequestParams {
  baseUrl: string
  accessToken: string
  organizationId: string
}

async function getJson<T>(url: URL, accessToken: string, fallbackMessage: string): Promise<T> {
  const res = await fetch(url, { headers: { Cookie: `access_token=${accessToken}` } })
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null
    throw new ConnectApiError(res.status, data?.error?.code ?? 'unknown', data?.error?.message ?? fallbackMessage)
  }
  return (await res.json()) as T
}

/**
 * Consulta online os entitlements atuais da org (GET /api/v1/entitlements,
 * ver ADR 0005) — usar quando o claim `products[]` do token, fixado no
 * login/refresh, puder estar defasado em relação à assinatura no Connect.
 */
export async function getActiveEntitlements(params: EntitlementsRequestParams): Promise<EntitlementsResult> {
  const url = new URL(`${params.baseUrl}/api/v1/entitlements`)
  url.searchParams.set('organizationId', params.organizationId)
  return getJson<EntitlementsResult>(url, params.accessToken, 'Falha ao consultar entitlements')
}

export interface CheckEntitlementParams extends EntitlementsRequestParams {
  product: string
}

/**
 * Checagem pontual de um único produto (GET /api/v1/entitlements/check) —
 * para os poucos casos que exigem consistência imediata (ADR 0005), sem
 * precisar carregar a lista inteira de produtos da org.
 */
export async function checkEntitlement(params: CheckEntitlementParams): Promise<boolean> {
  const url = new URL(`${params.baseUrl}/api/v1/entitlements/check`)
  url.searchParams.set('organizationId', params.organizationId)
  url.searchParams.set('product', params.product)
  const { allowed } = await getJson<{ allowed: boolean }>(url, params.accessToken, 'Falha ao checar entitlement')
  return allowed
}
