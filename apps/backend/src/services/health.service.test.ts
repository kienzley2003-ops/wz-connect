import { describe, it, expect } from 'vitest';
import { healthResponseSchema } from '@wz/shared';
import { buildHealth } from './health.service.js';

const now = new Date('2026-07-14T12:00:00.000Z');

describe('buildHealth', () => {
  it('retorna status "ok" quando o banco CORE está saudável', () => {
    const health = buildHealth({
      service: 'wz-connect-backend',
      version: '1.2.3',
      uptimeSeconds: 42,
      now,
      coreDbHealthy: true,
    });

    expect(health.status).toBe('ok');
    expect(health.service).toBe('wz-connect-backend');
    expect(health.version).toBe('1.2.3');
    expect(health.uptimeSeconds).toBe(42);
    expect(health.timestamp).toBe(now.toISOString());
  });

  it('retorna status "degraded" quando o banco CORE está indisponível', () => {
    const health = buildHealth({
      service: 'wz-connect-backend',
      version: '1.2.3',
      uptimeSeconds: 42,
      now,
      coreDbHealthy: false,
    });

    expect(health.status).toBe('degraded');
  });

  it('produz um payload que satisfaz o contrato compartilhado', () => {
    const health = buildHealth({
      service: 'wz-connect-backend',
      version: '0.0.0',
      uptimeSeconds: 0,
      now,
      coreDbHealthy: true,
    });

    expect(() => healthResponseSchema.parse(health)).not.toThrow();
  });
});
