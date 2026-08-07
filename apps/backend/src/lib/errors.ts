export class AppError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class LockedAccountError extends AppError {
  constructor(public lockedUntil: Date) {
    super('account-locked', 423, 'Conta bloqueada por excesso de tentativas', { lockedUntil })
  }
}

export class InvalidCredentialsError extends AppError {
  constructor() {
    super('invalid-credentials', 401, 'Email ou senha inválidos')
  }
}

export class MfaRequiredError extends AppError {
  constructor() {
    super('mfa-required', 401, 'MFA obrigatório')
  }
}

export class MfaInvalidError extends AppError {
  constructor() {
    super('mfa-invalid', 401, 'Código MFA inválido')
  }
}

export class MfaNotEnrolledError extends AppError {
  constructor() {
    super('mfa-not-enrolled', 400, 'MFA não configurado')
  }
}

export class CsrfMismatchError extends AppError {
  constructor() {
    super('csrf-mismatch', 403, 'Token CSRF inválido')
  }
}

export class SessionRevokedError extends AppError {
  constructor() {
    super('session-revoked', 401, 'Sessão revogada por novo login')
  }
}

export class TenantNotFoundError extends AppError {
  constructor(public host: string) {
    super('tenant-not-found', 400, 'Subdomínio não resolve para nenhuma organização', { host })
  }
}

export class NotAMemberError extends AppError {
  constructor() {
    super('not-a-member', 403, 'Usuário não pertence a esta organização')
  }
}

export class ImpersonationForbiddenError extends AppError {
  constructor() {
    super('impersonation-forbidden', 403, 'Apenas super-admin pode impersonar')
  }
}

export class CrossOrgAccessError extends AppError {
  constructor() {
    super('cross-org-access', 403, 'Acesso negado a recurso de outra organização')
  }
}

export class InsufficientRoleError extends AppError {
  constructor() {
    super('insufficient-role', 403, 'Seu papel não tem permissão para esta ação')
  }
}

export class UnauthenticatedError extends AppError {
  constructor() {
    super('unauthenticated', 401, 'Autenticação necessária')
  }
}
