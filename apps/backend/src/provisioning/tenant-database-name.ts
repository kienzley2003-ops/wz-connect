const PREFIX = 'wz_tenant_';

/** Identificadores no PostgreSQL têm no máximo 63 bytes. */
const MAX_IDENTIFIER_LENGTH = 63;
const MAX_SLUG_LENGTH = MAX_IDENTIFIER_LENGTH - PREFIX.length;

/** Letra minúscula inicial, depois minúsculas/dígitos/underscore. */
const SAFE_SLUG = /^[a-z][a-z0-9_]*$/;

/**
 * Valida o slug de um tenant.
 *
 * **Crítico para segurança:** `CREATE DATABASE` não aceita parâmetros ligados, então
 * o nome é interpolado na SQL. Só slugs que passam aqui podem virar identificador.
 */
export function isSafeSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= MAX_SLUG_LENGTH && SAFE_SLUG.test(slug);
}

/**
 * Nome do banco exclusivo de um tenant: `wz_tenant_<slug>`.
 * @throws Error se o slug não for seguro (nunca interpola entrada não validada).
 */
export function tenantDatabaseName(slug: string): string {
  if (!isSafeSlug(slug)) {
    throw new Error(
      `Slug de tenant inválido: "${slug}" — use [a-z][a-z0-9_]* com até ${MAX_SLUG_LENGTH} caracteres`,
    );
  }
  return `${PREFIX}${slug}`;
}
