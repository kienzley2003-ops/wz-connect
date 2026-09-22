// SDK público consumido por wz-desk, wz-masterfila, wz-orc e wz-agente
// (substitui o tarball vendor de wz-masterfila/vendor/wz-connect-sdk-0.2.0.tgz
// — ver ADR 0002).
//
// Cobre a parte de Auth do contrato (Frente A): verificação local de
// token, refresh de sessão e auditoria central. A parte de Billing
// (connect.entitlements.*) é da Frente B, ainda não iniciada.

export { verifyAccessToken, type AccessTokenPayload } from './jwt.js'
export { logAuditEvent, type AuditLogEvent, type AuditLogParams } from './audit.js'
export { refreshSession, type RefreshParams, type RefreshResult } from './refresh.js'
export { ConnectApiError, InvalidTokenError, TokenExpiredError } from './errors.js'

import { verifyAccessToken, type AccessTokenPayload } from './jwt.js'
import { logAuditEvent, type AuditLogEvent } from './audit.js'
import { refreshSession, type RefreshResult } from './refresh.js'

export interface ConnectClientConfig {
  /** URL base do backend do wz-connect, ex.: http://localhost:3000 */
  baseUrl: string
  /** Mesmo JWT_SECRET do wz-connect — necessário para verificar token localmente. */
  jwtSecret: string
}

export interface ConnectClient {
  auth: {
    verifyToken(token: string): AccessTokenPayload
    refresh(refreshToken: string, csrfToken: string): Promise<RefreshResult>
  }
  audit: {
    log(accessToken: string, event: AuditLogEvent): Promise<void>
  }
}

export function createConnectClient(config: ConnectClientConfig): ConnectClient {
  return {
    auth: {
      verifyToken: (token) => verifyAccessToken(config.jwtSecret, token),
      refresh: (refreshToken, csrfToken) =>
        refreshSession({ baseUrl: config.baseUrl, refreshToken, csrfToken }),
    },
    audit: {
      log: (accessToken, event) => logAuditEvent({ baseUrl: config.baseUrl, accessToken, event }),
    },
  }
}
