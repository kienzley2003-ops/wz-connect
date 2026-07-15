import { ModuleNotEnabledError, type ConnectClaims } from './types.js';

/**
 * O tenant do token tem o módulo habilitado?
 *
 * Lê o claim `mods` — **assinado pelo Connect**, então não precisa de rede.
 * Consequência: mudanças de módulo só valem para o produto após novo login.
 * Para decisão sempre fresca, use `checkEntitlement`.
 */
export function hasModule(claims: ConnectClaims, moduleKey: string): boolean {
  return claims.mods?.includes(moduleKey) ?? false;
}

/** @throws ModuleNotEnabledError quando o tenant não contratou o módulo. */
export function requireModule(claims: ConnectClaims, moduleKey: string): void {
  if (!hasModule(claims, moduleKey)) {
    throw new ModuleNotEnabledError(moduleKey);
  }
}

/** Subdomínio do tenant do token, ou `null` em token de plataforma. */
export function tenantOf(claims: ConnectClaims): string | null {
  return claims.tnt ?? null;
}
