import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Cifra de credenciais de tenant — envelope encryption AES-256-GCM (ADR-006).
 *
 * Formato do payload: `v1:<iv>:<ciphertext>:<authTag>` (cada bloco em base64).
 * A KEK (chave-mestra, vinda do ambiente) é derivada para 32 bytes via SHA-256.
 */

const VERSION = 'v1';
const IV_BYTES = 12; // padrão recomendado para GCM

function deriveKey(kek: string): Buffer {
  return createHash('sha256').update(kek, 'utf8').digest();
}

/** Cifra um segredo (ex.: senha do banco do tenant) com a KEK. */
export function encryptCredential(plaintext: string, kek: string): string {
  const key = deriveKey(kek);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64'),
    ciphertext.toString('base64'),
    authTag.toString('base64'),
  ].join(':');
}

/**
 * Decifra um payload gerado por {@link encryptCredential}.
 * @throws Error em formato inválido, versão desconhecida, KEK errada ou adulteração.
 */
export function decryptCredential(payload: string, kek: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4) {
    throw new Error('Credencial cifrada com formato inválido');
  }

  const [version, ivB64, ctB64, tagB64] = parts as [string, string, string, string];
  if (version !== VERSION) {
    throw new Error(`Versão de cifra não suportada: ${version}`);
  }

  const key = deriveKey(kek);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString(
    'utf8',
  );
}
