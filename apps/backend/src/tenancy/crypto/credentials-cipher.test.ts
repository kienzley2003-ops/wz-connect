import { describe, it, expect } from 'vitest';
import { encryptCredential, decryptCredential } from './credentials-cipher.js';

const KEK = 'k'.repeat(32);

describe('credentials-cipher (AES-256-GCM envelope encryption)', () => {
  it('faz round-trip: decrypt(encrypt(x)) === x', () => {
    const secret = 'super-secret-db-password';
    const enc = encryptCredential(secret, KEK);
    expect(decryptCredential(enc, KEK)).toBe(secret);
  });

  it('nunca expõe o texto puro no ciphertext', () => {
    const secret = 'plaintext-visivel';
    const enc = encryptCredential(secret, KEK);
    expect(enc).not.toContain(secret);
  });

  it('produz ciphertexts diferentes para o mesmo texto (IV aleatório)', () => {
    const secret = 'mesmo-segredo';
    expect(encryptCredential(secret, KEK)).not.toBe(encryptCredential(secret, KEK));
  });

  it('usa o prefixo de versão v1', () => {
    expect(encryptCredential('x', KEK).startsWith('v1:')).toBe(true);
  });

  it('falha ao decifrar com KEK errada', () => {
    const enc = encryptCredential('segredo', KEK);
    expect(() => decryptCredential(enc, 'w'.repeat(32))).toThrow();
  });

  it('detecta adulteração do ciphertext (authTag GCM)', () => {
    const enc = encryptCredential('segredo', KEK);
    const parts = enc.split(':');
    // corrompe o bloco do ciphertext
    const tampered = [parts[0], parts[1], 'AAAurcorrupted', parts[3]].join(':');
    expect(() => decryptCredential(tampered, KEK)).toThrow();
  });

  it('rejeita payload com formato inválido', () => {
    expect(() => decryptCredential('formato-invalido', KEK)).toThrow(/formato/i);
  });

  it('rejeita versão desconhecida', () => {
    expect(() => decryptCredential('v9:a:b:c', KEK)).toThrow(/vers/i);
  });
});
