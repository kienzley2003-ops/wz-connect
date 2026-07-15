import { describe, it, expect } from 'vitest';
import { buildApp } from './app.js';

describe('buildApp', () => {
  it('GET /health responde 200 com status "ok" quando o CORE está saudável', async () => {
    const app = await buildApp({ version: '9.9.9', checkCoreDb: async () => true });
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('wz-connect-backend');
    expect(body.version).toBe('9.9.9');

    await app.close();
  });

  it('GET /health reporta "degraded" quando o CORE está indisponível', async () => {
    const app = await buildApp({ version: '9.9.9', checkCoreDb: async () => false });
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('degraded');

    await app.close();
  });

  it('GET / retorna nome e versão do serviço', async () => {
    const app = await buildApp({ version: '1.0.0', checkCoreDb: async () => true });
    const res = await app.inject({ method: 'GET', url: '/' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ name: 'wz-connect-backend', version: '1.0.0' });

    await app.close();
  });

  describe('rate limit', () => {
    it('responde 429 ao estourar o limite global', async () => {
      const app = await buildApp({
        version: '1.0.0',
        checkCoreDb: async () => true,
        rateLimit: { global: 3, login: 10, timeWindow: 60_000 },
      });

      const codes: number[] = [];
      for (let i = 0; i < 4; i++) {
        codes.push((await app.inject({ method: 'GET', url: '/health' })).statusCode);
      }

      expect(codes.slice(0, 3)).toEqual([200, 200, 200]);
      expect(codes[3]).toBe(429);
      await app.close();
    });

    it('expõe headers de rate limit', async () => {
      const app = await buildApp({
        version: '1.0.0',
        checkCoreDb: async () => true,
        rateLimit: { global: 5, login: 10, timeWindow: 60_000 },
      });

      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.headers['x-ratelimit-limit']).toBe('5');
      await app.close();
    });

    it('fica desligado quando não configurado (padrão em testes)', async () => {
      const app = await buildApp({ version: '1.0.0', checkCoreDb: async () => true });

      const codes: number[] = [];
      for (let i = 0; i < 5; i++) {
        codes.push((await app.inject({ method: 'GET', url: '/health' })).statusCode);
      }
      expect(codes.every((c) => c === 200)).toBe(true);
      await app.close();
    });
  });

  describe('docs', () => {
    it('publica a especificação OpenAPI quando habilitado', async () => {
      const app = await buildApp({
        version: '2.0.0',
        checkCoreDb: async () => true,
        docs: true,
      });
      await app.ready();

      const spec = app.swagger();
      expect(spec.info?.title).toBe('WZ Connect API');
      expect(spec.info?.version).toBe('2.0.0');
      expect(Object.keys(spec.paths ?? {})).toContain('/health');
      await app.close();
    });

    it('não expõe docs quando desabilitado', async () => {
      const app = await buildApp({ version: '1.0.0', checkCoreDb: async () => true });
      const res = await app.inject({ method: 'GET', url: '/api/v1/docs' });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });
});
