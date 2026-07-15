/** Limite de plano: booleano (liga/desliga) ou numérico (teto de uso). */
export type PlanLimitValue = boolean | number | string;

export interface Entitlements {
  /** Chaves dos módulos habilitados para o tenant. */
  readonly mods: string[];
  /** Limites efetivos vindos do plano. */
  readonly limits: Record<string, PlanLimitValue>;
}

export interface ResolveInput {
  readonly planLimits: Record<string, PlanLimitValue> | null;
  readonly enabledModules: readonly string[];
}

/**
 * Resolve os entitlements efetivos de um tenant: módulos habilitados
 * (`tenant_modules`) + limites do plano (`plans.limites`). ADR-006/007.
 */
export function resolveEntitlements(input: ResolveInput): Entitlements {
  return {
    mods: [...input.enabledModules],
    limits: input.planLimits ?? {},
  };
}

export interface CheckInput {
  /** Chave do módulo a validar (ex.: 'masterfila'). */
  readonly module?: string;
  /** Chave da feature/limite no plano (ex.: 'guiches_max'). */
  readonly feature?: string;
  /** Uso atual, para limites numéricos. */
  readonly usage?: number;
}

export type CheckResult = { allowed: true } | { allowed: false; reason: string; limit?: number };

/**
 * Decide se uma ação é permitida pelos entitlements do tenant.
 * Regra única de licenciamento (padrão Policy — DRY).
 */
export function checkEntitlement(entitlements: Entitlements, input: CheckInput): CheckResult {
  if (input.module !== undefined && !entitlements.mods.includes(input.module)) {
    return { allowed: false, reason: 'module_not_enabled' };
  }

  if (input.feature !== undefined) {
    const limit = entitlements.limits[input.feature];

    if (limit === undefined) {
      return { allowed: false, reason: 'feature_not_in_plan' };
    }
    if (typeof limit === 'boolean') {
      return limit ? { allowed: true } : { allowed: false, reason: 'feature_disabled' };
    }
    if (typeof limit === 'number' && input.usage !== undefined) {
      return input.usage < limit
        ? { allowed: true }
        : { allowed: false, reason: 'limit_exceeded', limit };
    }
  }

  return { allowed: true };
}
