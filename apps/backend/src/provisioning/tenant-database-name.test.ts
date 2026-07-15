import { describe, it, expect } from 'vitest';
import { tenantDatabaseName, isSafeSlug } from './tenant-database-name.js';

describe('isSafeSlug', () => {
  it.each(['acme', 'acme_2', 'a', 'empresa123'])('aceita slug válido: %s', (slug) => {
    expect(isSafeSlug(slug)).toBe(true);
  });

  it.each([
    ['vazio', ''],
    ['maiúsculas', 'Acme'],
    ['hífen', 'acme-corp'],
    ['espaço', 'acme corp'],
    ['aspas', "acme'"],
    ['ponto e vírgula', 'acme;drop'],
    ['começa com número', '1acme'],
    ['começa com underscore', '_acme'],
    ['acentos', 'acmé'],
  ])('rejeita slug inválido (%s)', (_caso, slug) => {
    expect(isSafeSlug(slug)).toBe(false);
  });

  it('rejeita slug longo demais para o limite do PostgreSQL', () => {
    expect(isSafeSlug('a'.repeat(60))).toBe(false);
  });
});

describe('tenantDatabaseName', () => {
  it('deriva o nome do banco a partir do slug', () => {
    expect(tenantDatabaseName('acme')).toBe('wz_tenant_acme');
  });

  it('lança erro em slug inseguro em vez de interpolar', () => {
    expect(() => tenantDatabaseName('acme; DROP DATABASE postgres')).toThrow(/slug/i);
  });

  it('lança erro em slug vazio', () => {
    expect(() => tenantDatabaseName('')).toThrow(/slug/i);
  });

  it('nunca ultrapassa o limite de 63 caracteres de identificador do PostgreSQL', () => {
    const maxSlug = 'a'.repeat(50);
    expect(isSafeSlug(maxSlug)).toBe(true);
    expect(tenantDatabaseName(maxSlug).length).toBeLessThanOrEqual(63);
  });
});
