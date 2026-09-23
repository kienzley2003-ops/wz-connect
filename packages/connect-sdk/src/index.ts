// SDK público consumido por wz-desk, wz-masterfila, wz-orc e wz-agente
// (substitui o tarball vendor de wz-masterfila/vendor/wz-connect-sdk-0.2.0.tgz
// — ver ADR 0002).
//
// Cobre Auth (Frente A: verificação local de token, refresh de sessão,
// auditoria central) e Billing (Frente B: connect.entitlements.*, ver
// ADR 0005) do contrato do SDK.

export { verifyAccessToken, type AccessTokenPayload } from './jwt.js'
export { logAuditEvent, type AuditLogEvent, type AuditLogParams } from './audit.js'
export { refreshSession, type RefreshParams, type RefreshResult } from './refresh.js'
export {
  getActiveEntitlements,
  checkEntitlement,
  type EntitlementsResult,
  type CheckEntitlementParams,
} from './entitlements.js'
export { ConnectApiError, InvalidTokenError, TokenExpiredError } from './errors.js'

import { verifyAccessToken, type AccessTokenPayload } from './jwt.js'
import { logAuditEvent, type AuditLogEvent } from './audit.js'
import { refreshSession, type RefreshResult } from './refresh.js'
import { getActiveEntitlements, checkEntitlement, type EntitlementsResult } from './entitlements.js'

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
  entitlements: {
    getActiveEntitlements(accessToken: string, organizationId: string): Promise<EntitlementsResult>
    check(accessToken: string, organizationId: string, product: string): Promise<boolean>
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
    entitlements: {
      getActiveEntitlements: (accessToken, organizationId) =>
        getActiveEntitlements({ baseUrl: config.baseUrl, accessToken, organizationId }),
      check: (accessToken, organizationId, product) =>
        checkEntitlement({ baseUrl: config.baseUrl, accessToken, organizationId, product }),
    },
  }
}
