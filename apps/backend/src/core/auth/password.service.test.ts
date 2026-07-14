import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password.service.js';

describe('password.service (Argon2)', () => {
  it('faz hash e verifica a senha correta', async () => {
    const hash = await hashPassword('Senha@1234');
    expect(hash).not.toBe('Senha@1234');
    expect(await verifyPassword(hash, 'Senha@1234')).toBe(true);
  });

  it('rejeita senha incorreta', async () => {
    const hash = await hashPassword('Senha@1234');
    expect(await verifyPassword(hash, 'errada')).toBe(false);
  });

  it('gera hashes diferentes para a mesma senha (salt aleatório)', async () => {
    const a = await hashPassword('mesma');
    const b = await hashPassword('mesma');
    expect(a).not.toBe(b);
  });

  it('retorna false para um hash malformado em vez de lançar', async () => {
    expect(await verifyPassword('nao-e-um-hash', 'qualquer')).toBe(false);
  });
});
