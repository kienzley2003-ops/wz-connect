/** Claims emitidos pelo WZ Connect (ADR-008). */
export interface ConnectClaims {
  /** Usuário global. */
  readonly sub: string;
  /** Sessão ativa (sessão única). */
  readonly sid: string;
  /** Papel de plataforma, quando houver. */
  readonly prole?: string;
  /** Subdomínio do tenant; ausente em token de plataforma. */
  readonly tnt?: string;
  /** Papéis na organização. */
  readonly roles?: string[];
  /** Módulos habilitados para o tenant. */
  readonly mods?: string[];
  readonly iss?: string;
  readonly exp?: number;
  readonly iat?: number;
}

/** Resultado de uma checagem de entitlement. */
export type EntitlementResult =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string; readonly limit?: number };

export interface EntitlementQuery {
  readonly module?: string;
  readonly feature?: string;
  readonly usage?: number;
}

export class ModuleNotEnabledError extends Error {
  constructor(public readonly moduleKey: string) {
    super(`Módulo não habilitado para o tenant: ${moduleKey}`);
    this.name = 'ModuleNotEnabledError';
  }
}

export class ConnectApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ConnectApiError';
  }
}
