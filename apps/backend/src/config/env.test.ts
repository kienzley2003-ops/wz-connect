import { describe, it, expect } from 'vitest';
import { loadEnv } from './env.js';

const base = {
  NODE_ENV: 'test',
  PORT: '3000',
  HOST: '0.0.0.0',
  CORE_DATABASE_URL: 'postgres://u:p@localhost:5432/wz_connect_core',
  JWT_SECRET: 'a'.repeat(32),
  TENANT_CREDENTIALS_KEK: 'k'.repeat(32),
};

describe('loadEnv', () => {
  it('faz parse de um ambiente válido e coage tipos', () => {
    const cfg = loadEnv(base);

    expect(cfg.nodeEnv).toBe('test');
    expect(cfg.port).toBe(3000);
    expect(cfg.port).toBeTypeOf('number');
    expect(cfg.host).toBe('0.0.0.0');
    expect(cfg.coreDatabaseUrl).toBe(base.CORE_DATABASE_URL);
  });

  it('usa process.env como fonte padrão quando nenhuma é passada', () => {
    const saved = { ...process.env };
    try {
      process.env.NODE_ENV = 'test';
      process.env.CORE_DATABASE_URL = base.CORE_DATABASE_URL;
      process.env.JWT_SECRET = base.JWT_SECRET;
      process.env.TENANT_CREDENTIALS_KEK = base.TENANT_CREDENTIALS_KEK;

      const cfg = loadEnv();

      expect(cfg.coreDatabaseUrl).toBe(base.CORE_DATABASE_URL);
      expect(cfg.jwtSecret).toBe(base.JWT_SECRET);
    } finally {
      process.env = saved;
    }
  });

  it('aplica defaults para NODE_ENV, PORT e HOST', () => {
    const cfg = loadEnv({
      CORE_DATABASE_URL: base.CORE_DATABASE_URL,
      JWT_SECRET: base.JWT_SECRET,
      TENANT_CREDENTIALS_KEK: base.TENANT_CREDENTIALS_KEK,
    });

    expect(cfg.nodeEnv).toBe('development');
    expect(cfg.port).toBe(3000);
    expect(cfg.host).toBe('0.0.0.0');
  });

  it('lança erro quando CORE_DATABASE_URL está ausente', () => {
    const { CORE_DATABASE_URL: _omit, ...withoutDb } = base;
    expect(() => loadEnv(withoutDb)).toThrow(/CORE_DATABASE_URL/);
  });

  it('lança erro quando JWT_SECRET é curto demais', () => {
    expect(() => loadEnv({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('lança erro quando TENANT_CREDENTIALS_KEK é curto demais', () => {
    expect(() => loadEnv({ ...base, TENANT_CREDENTIALS_KEK: 'short' })).toThrow(
      /TENANT_CREDENTIALS_KEK/,
    );
  });

  it('lança erro quando PORT não é numérico', () => {
    expect(() => loadEnv({ ...base, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('rejeita CORE_DATABASE_URL que não é uma URL', () => {
    expect(() => loadEnv({ ...base, CORE_DATABASE_URL: 'not-a-url' })).toThrow(/CORE_DATABASE_URL/);
  });
});
