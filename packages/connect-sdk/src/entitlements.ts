import { ConnectApiError, type EntitlementQuery, type EntitlementResult } from './types.js';

export interface EntitlementClientOptions {
  /** Base URL do Connect (ex.: `https://connect.wz.com`). */
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
}

/**
 * Consulta o Connect sobre um entitlement (limite/módulo) do tenant.
 *
 * Usa o **token do próprio usuário** — o produto age em nome de quem pediu, o
 * que dispensa credencial máquina-a-máquina. Diferente de `hasModule`, isto
 * pega a decisão **fresca** no CORE (custo: uma chamada de rede).
 */
export async function checkEntitlement(
  token: string,
  query: EntitlementQuery,
  options: EntitlementClientOptions,
): Promise<EntitlementResult> {
  const url = `${options.baseUrl.replace(/\/$/, '')}/entitlements/check`;

  let response: Response;
  try {
    response = await options.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(query),
    });
  } catch (err) {
    throw new ConnectApiError(
      `Falha ao consultar entitlements: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    throw new ConnectApiError('Falha ao consultar entitlements', response.status);
  }

  return (await response.json()) as EntitlementResult;
}
