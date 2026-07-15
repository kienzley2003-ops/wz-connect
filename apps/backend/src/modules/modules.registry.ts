import type { WzModule } from './module.contract.js';

/**
 * Registry dos módulos carregados no runtime (ADR-007).
 * Cruza o que a aplicação sabe servir com o que o tenant tem habilitado no CORE.
 */
export class ModulesRegistry {
  private readonly modules = new Map<string, WzModule>();

  /** @throws Error se a chave já estiver registrada. */
  register(module: WzModule): void {
    if (this.modules.has(module.key)) {
      throw new Error(`Módulo já registrado: ${module.key}`);
    }
    this.modules.set(module.key, module);
  }

  get(key: string): WzModule | undefined {
    return this.modules.get(key);
  }

  has(key: string): boolean {
    return this.modules.has(key);
  }

  keys(): string[] {
    return [...this.modules.keys()];
  }

  /** Módulos carregados, na ordem de registro. */
  list(): WzModule[] {
    return [...this.modules.values()];
  }

  /** Módulos carregados que o tenant tem habilitados. */
  enabledFor(tenantModuleKeys: readonly string[]): WzModule[] {
    return this.list().filter((m) => tenantModuleKeys.includes(m.key));
  }

  /**
   * Chaves habilitadas no CORE mas sem módulo carregado (drift de configuração).
   * Útil para alertar em vez de falhar silenciosamente.
   */
  missing(tenantModuleKeys: readonly string[]): string[] {
    return tenantModuleKeys.filter((key) => !this.modules.has(key));
  }
}
