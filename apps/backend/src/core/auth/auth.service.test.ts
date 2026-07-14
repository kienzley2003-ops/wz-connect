import { describe, it, expect, vi } from 'vitest';
import {
  AuthService,
  InvalidCredentialsError,
  AccountLockedError,
  UserInactiveError,
  type AuthUser,
  type AuthServiceDeps,
} from './auth.service.js';

const now = new Date('2026-07-14T12:00:00.000Z');

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-1',
    email: 'admin@wz.test',
    senhaHash: 'hash',
    status: 'ativo',
    tentativasLogin: 0,
    bloqueadoAte: null,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<AuthServiceDeps> = {}): AuthServiceDeps {
  return {
    findUserByEmail: vi.fn(async () => user()),
    updateAuthState: vi.fn(async () => {}),
    verifyPassword: vi.fn(async () => true),
    signToken: vi.fn(async () => 'signed.jwt.token'),
    newSessionId: vi.fn(() => 'sess-1'),
    now: () => now,
    ...overrides,
  };
}

describe('AuthService.login', () => {
  it('autentica, define a sessão ativa e retorna o token', async () => {
    const deps = makeDeps();
    const result = await new AuthService(deps).login('admin@wz.test', 'senha');

    expect(result.token).toBe('signed.jwt.token');
    expect(result.sessionId).toBe('sess-1');
    expect(deps.signToken).toHaveBeenCalledWith({ sub: 'user-1', sid: 'sess-1' });
    expect(deps.updateAuthState).toHaveBeenCalledWith('user-1', {
      tentativasLogin: 0,
      bloqueadoAte: null,
      sessaoAtivaId: 'sess-1',
    });
  });

  it('rejeita e-mail desconhecido sem alterar estado', async () => {
    const deps = makeDeps({ findUserByEmail: vi.fn(async () => null) });
    await expect(new AuthService(deps).login('x@y.z', 'senha')).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
    expect(deps.updateAuthState).not.toHaveBeenCalled();
  });

  it('registra falha ao errar a senha', async () => {
    const deps = makeDeps({ verifyPassword: vi.fn(async () => false) });
    await expect(new AuthService(deps).login('admin@wz.test', 'errada')).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
    expect(deps.updateAuthState).toHaveBeenCalledWith('user-1', {
      tentativasLogin: 1,
      bloqueadoAte: null,
    });
  });

  it('bloqueia após a 5ª falha', async () => {
    const deps = makeDeps({
      findUserByEmail: vi.fn(async () => user({ tentativasLogin: 4 })),
      verifyPassword: vi.fn(async () => false),
    });
    await expect(new AuthService(deps).login('admin@wz.test', 'errada')).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
    const patch = (deps.updateAuthState as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(patch.tentativasLogin).toBe(0);
    expect(patch.bloqueadoAte).toBeInstanceOf(Date);
  });

  it('recusa conta bloqueada sem verificar a senha', async () => {
    const deps = makeDeps({
      findUserByEmail: vi.fn(async () => user({ bloqueadoAte: new Date(now.getTime() + 60_000) })),
    });
    await expect(new AuthService(deps).login('admin@wz.test', 'senha')).rejects.toBeInstanceOf(
      AccountLockedError,
    );
    expect(deps.verifyPassword).not.toHaveBeenCalled();
  });

  it('recusa usuário inativo', async () => {
    const deps = makeDeps({ findUserByEmail: vi.fn(async () => user({ status: 'desativado' })) });
    await expect(new AuthService(deps).login('admin@wz.test', 'senha')).rejects.toBeInstanceOf(
      UserInactiveError,
    );
  });
});
