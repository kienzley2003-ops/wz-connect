import { describe, it, expect } from 'vitest';
import { buildApp } from './app.js';

describe('buildApp', () => {
  it('GET /health responde 200 com status "ok" quando o CORE está saudável', async () => {
    const app = buildApp({ version: '9.9.9', checkCoreDb: async () => true });
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('wz-connect-backend');
    expect(body.version).toBe('9.9.9');

    await app.close();
  });

  it('GET /health reporta "degraded" quando o CORE está indisponível', async () => {
    const app = buildApp({ version: '9.9.9', checkCoreDb: async () => false });
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('degraded');

    await app.close();
  });

  it('GET / retorna nome e versão do serviço', async () => {
    const app = buildApp({ version: '1.0.0', checkCoreDb: async () => true });
    const res = await app.inject({ method: 'GET', url: '/' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ name: 'wz-connect-backend', version: '1.0.0' });

    await app.close();
  });
});
