import { describe, it, expect } from 'vitest';
import { tenantRoleName, generateDatabasePassword } from './tenant-role.js';

describe('tenantRoleName', () => {
  it('deriva a role do slug', () => {
    expect(tenantRoleName('acme')).toBe('wz_app_acme');
  });

  it('lança erro em slug inseguro em vez de interpolar', () => {
    expect(() => tenantRoleName("acme'; DROP ROLE postgres --")).toThrow(/slug/i);
  });

  it('lança erro em slug vazio', () => {
    expect(() => tenantRoleName('')).toThrow(/slug/i);
  });

  it('respeita o limite de 63 caracteres do PostgreSQL', () => {
    expect(tenantRoleName('a'.repeat(50)).length).toBeLessThanOrEqual(63);
  });

  it('difere do nome do banco (role e database são identificadores distintos)', () => {
    expect(tenantRoleName('acme')).not.toBe('wz_tenant_acme');
  });
});

describe('generateDatabasePassword', () => {
  it('gera senhas diferentes a cada chamada', () => {
    expect(generateDatabasePassword()).not.toBe(generateDatabasePassword());
  });

  it('gera senha longa o bastante', () => {
    expect(generateDatabasePassword().length).toBeGreaterThanOrEqual(40);
  });

  it('usa só caracteres seguros para DDL (base64url: sem aspas, sem barra)', () => {
    // CREATE ROLE ... PASSWORD '<pw>' interpola a senha na SQL: uma aspa
    // simples na senha quebraria o comando (ou abriria injeção).
    for (let i = 0; i < 50; i++) {
      expect(generateDatabasePassword()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('permite ajustar a entropia', () => {
    expect(generateDatabasePassword(64).length).toBeGreaterThan(
      generateDatabasePassword(16).length,
    );
  });
});
