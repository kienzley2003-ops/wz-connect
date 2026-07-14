import { describe, it, expect } from 'vitest';
import { extractSubdomain } from './subdomain.js';

describe('extractSubdomain', () => {
  const base = 'wzconnect.com';

  it('extrai o subdomínio sob o domínio base', () => {
    expect(extractSubdomain('acme.wzconnect.com', base)).toBe('acme');
  });

  it('ignora a porta no host', () => {
    expect(extractSubdomain('acme.wzconnect.com:8080', base)).toBe('acme');
  });

  it('normaliza para minúsculas', () => {
    expect(extractSubdomain('ACME.WZConnect.com', base)).toBe('acme');
  });

  it('retorna null para o domínio base sem subdomínio', () => {
    expect(extractSubdomain('wzconnect.com', base)).toBeNull();
  });

  it('trata "www" como reservado (null)', () => {
    expect(extractSubdomain('www.wzconnect.com', base)).toBeNull();
  });

  it('retorna null para host fora do domínio base', () => {
    expect(extractSubdomain('acme.outrodominio.com', base)).toBeNull();
  });

  it('retorna null para host ausente', () => {
    expect(extractSubdomain(undefined, base)).toBeNull();
  });

  it('suporta subdomínio em localhost sem domínio base (dev)', () => {
    expect(extractSubdomain('acme.localhost')).toBe('acme');
  });

  it('retorna null para localhost puro', () => {
    expect(extractSubdomain('localhost')).toBeNull();
  });

  it('extrai o primeiro rótulo quando não há domínio base configurado', () => {
    expect(extractSubdomain('acme.wzconnect.com')).toBe('acme');
  });
});
