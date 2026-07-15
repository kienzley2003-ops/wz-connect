export class UnknownModuleError extends Error {
  constructor(public readonly moduleKey: string) {
    super(`Módulo fora do catálogo: ${moduleKey}`);
    this.name = 'UnknownModuleError';
  }
}

export interface DiffModulesInput {
  /** Módulos hoje habilitados para o tenant. */
  readonly current: readonly string[];
  /** Módulos que devem ficar habilitados. */
  readonly desired: readonly string[];
  /** Catálogo de módulos conhecidos. */
  readonly catalog: readonly string[];
}

export interface ModulesDiff {
  readonly toEnable: string[];
  readonly toDisable: string[];
}

/**
 * Calcula o que habilitar/desabilitar para o tenant chegar ao estado desejado.
 *
 * Só valida o **desejado** contra o catálogo: um módulo que saiu do catálogo mas
 * segue habilitado precisa poder ser removido, senão o legado ficaria preso.
 */
export function diffModules(input: DiffModulesInput): ModulesDiff {
  const desired = [...new Set(input.desired)];

  for (const key of desired) {
    if (!input.catalog.includes(key)) {
      throw new UnknownModuleError(key);
    }
  }

  return {
    toEnable: desired.filter((key) => !input.current.includes(key)),
    toDisable: input.current.filter((key) => !desired.includes(key)),
  };
}
