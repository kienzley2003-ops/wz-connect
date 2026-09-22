import { ConnectApiError } from './errors.js'

export interface AuditLogEvent {
  product: 'connect' | 'masterfila' | 'desk' | 'orc' | 'agente'
  action: string
  target?: string
  metadata?: Record<string, unknown>
  organizationId?: string
}

export interface AuditLogParams {
  baseUrl: string
  accessToken: string
  event: AuditLogEvent
}

/**
 * Grava um evento na auditoria central do Connect (ADR 0008) — é assim que
 * os outros produtos do hub registram uma ação administrativa na timeline
 * cross-módulo de uma organização. `accessToken` é o cookie access_token
 * do usuário que executou a ação (o Connect autentica POST /audit por
 * cookie, não por header Authorization — ver auth/hooks/require-auth.ts).
 */
export async function logAuditEvent(params: AuditLogParams): Promise<void> {
  const res = await fetch(`${params.baseUrl}/api/v1/audit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `access_token=${params.accessToken}`,
    },
    body: JSON.stringify(params.event),
  })

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null
    throw new ConnectApiError(
      res.status,
      data?.error?.code ?? 'unknown',
      data?.error?.message ?? 'Falha ao gravar evento de auditoria'
    )
  }
}
