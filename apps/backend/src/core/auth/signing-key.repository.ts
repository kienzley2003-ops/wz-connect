import { ne } from 'drizzle-orm';
import type { CoreDb } from '../../db/core/client.js';
import { signingKeys } from '../../db/core/schema.js';
import { decryptCredential } from '../../tenancy/crypto/credentials-cipher.js';

export interface LoadedSigningKey {
  readonly kid: string;
  readonly publicPem: string;
  readonly privatePem: string;
  readonly status: 'active' | 'retiring' | 'revoked';
}

/**
 * Carrega as chaves de assinatura não-revogadas do CORE, decifrando a chave
 * privada com a KEK (ADR-006/008). Revogadas são ignoradas.
 */
export async function loadSigningKeys(coreDb: CoreDb, kek: string): Promise<LoadedSigningKey[]> {
  const rows = await coreDb.select().from(signingKeys).where(ne(signingKeys.status, 'revoked'));
  return rows.map((row) => ({
    kid: row.kid,
    publicPem: row.publicPem,
    privatePem: decryptCredential(row.privatePemCifrada, kek),
    status: row.status,
  }));
}
