import { isLocked, registerFailure, registerSuccess } from './lockout.js';

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly senhaHash: string;
  readonly status: 'ativo' | 'bloqueado' | 'desativado';
  readonly tentativasLogin: number;
  readonly bloqueadoAte: Date | null;
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Credenciais inválidas');
    this.name = 'InvalidCredentialsError';
  }
}

export class AccountLockedError extends Error {
  constructor() {
    super('Conta temporariamente bloqueada por excesso de tentativas');
    this.name = 'AccountLockedError';
  }
}

export class UserInactiveError extends Error {
  constructor() {
    super('Usuário inativo');
    this.name = 'UserInactiveError';
  }
}

export interface AuthStatePatch {
  readonly tentativasLogin: number;
  readonly bloqueadoAte: Date | null;
  readonly sessaoAtivaId?: string;
}

export interface AuthServiceDeps {
  readonly findUserByEmail: (email: string) => Promise<AuthUser | null>;
  readonly updateAuthState: (userId: string, patch: AuthStatePatch) => Promise<void>;
  readonly verifyPassword: (hash: string, plain: string) => Promise<boolean>;
  readonly signToken: (claims: { sub: string; sid: string }) => Promise<string>;
  readonly newSessionId: () => string;
  readonly now: () => Date;
}

export interface LoginResult {
  readonly token: string;
  readonly userId: string;
  readonly sessionId: string;
}

/**
 * Orquestra o login global (ADR-008): lockout → verificação Argon2 →
 * sessão única → emissão do token. Toda dependência é injetada (testável).
 */
export class AuthService {
  private readonly deps: AuthServiceDeps;

  constructor(deps: AuthServiceDeps) {
    this.deps = deps;
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.deps.findUserByEmail(email);
    // Mesmo erro para usuário inexistente e senha errada (anti-enumeração).
    if (!user) {
      throw new InvalidCredentialsError();
    }
    if (user.status !== 'ativo') {
      throw new UserInactiveError();
    }

    const now = this.deps.now();
    if (isLocked(user, now)) {
      throw new AccountLockedError();
    }

    const passwordOk = await this.deps.verifyPassword(user.senhaHash, password);
    if (!passwordOk) {
      const next = registerFailure(user, now);
      await this.deps.updateAuthState(user.id, {
        tentativasLogin: next.tentativasLogin,
        bloqueadoAte: next.bloqueadoAte,
      });
      throw new InvalidCredentialsError();
    }

    const success = registerSuccess();
    const sessionId = this.deps.newSessionId();
    await this.deps.updateAuthState(user.id, {
      tentativasLogin: success.tentativasLogin,
      bloqueadoAte: success.bloqueadoAte,
      sessaoAtivaId: sessionId,
    });

    const token = await this.deps.signToken({ sub: user.id, sid: sessionId });
    return { token, userId: user.id, sessionId };
  }
}
