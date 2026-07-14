import { describe, it, expect } from 'vitest';
import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  it('aceita uma resposta de health válida', () => {
    const valid = {
      status: 'ok',
      service: 'wz-connect-backend',
      version: '0.0.0',
      uptimeSeconds: 12.5,
      timestamp: new Date('2026-07-14T00:00:00.000Z').toISOString(),
    };

    expect(() => healthResponseSchema.parse(valid)).not.toThrow();
  });

  it('rejeita status desconhecido', () => {
    const invalid = {
      status: 'explodindo',
      service: 'wz-connect-backend',
      version: '0.0.0',
      uptimeSeconds: 1,
      timestamp: new Date('2026-07-14T00:00:00.000Z').toISOString(),
    };

    expect(() => healthResponseSchema.parse(invalid)).toThrow();
  });

  it('rejeita uptime negativo', () => {
    const invalid = {
      status: 'ok',
      service: 'wz-connect-backend',
      version: '0.0.0',
      uptimeSeconds: -1,
      timestamp: new Date('2026-07-14T00:00:00.000Z').toISOString(),
    };

    expect(() => healthResponseSchema.parse(invalid)).toThrow();
  });
});
