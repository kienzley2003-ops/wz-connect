import { randomBytes } from 'node:crypto';
import { isSafeSlug } from './tenant-database-name.js';

const ROLE_PREFIX = 'wz_app_';
const MAX_IDENTIFIER_LENGTH = 63;

/**
 * Role de aplicação dedicada a UM tenant: `wz_app_<slug>`.
 *
 * Existe para tornar o isolamento do ADR-004 real também no nível de credencial:
 * a credencial entregue a um produto dá acesso **apenas** ao banco daquele tenant.
 * Com uma credencial compartilhada, entregar a de um cliente entregaria a de todos.
 *
 * @throws Error se o slug não for seguro (o nome vai para DDL, que não aceita
 * parâmetros ligados).
 */
export function tenantRoleName(slug: string): string {
  if (!isSafeSlug(slug)) {
    throw new Error(`Slug de tenant inválido para role: "${slug}"`);
  }
  const name = `${ROLE_PREFIX}${slug}`;
  if (name.length > MAX_IDENTIFIER_LENGTH) {
    throw new Error(`Nome de role excede ${MAX_IDENTIFIER_LENGTH} caracteres: ${name}`);
  }
  return name;
}

/**
 * Senha aleatória para a role do tenant.
 *
 * base64url de propósito: `CREATE ROLE ... PASSWORD '<pw>'` interpola a senha na
 * SQL, então o alfabeto não pode conter aspas nem barras.
 */
export function generateDatabasePassword(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
