/** Servidor PostgreSQL onde bancos de tenant podem ser criados (ADR-005/012). */
export interface Placement {
  readonly name: string;
  readonly host: string;
  readonly port: number;
  /** Usuário com permissão de CREATE DATABASE nesse servidor. */
  readonly user: string;
  readonly password: string;
}

export class UnknownPlacementError extends Error {
  constructor(public readonly placement: string) {
    super(`Placement de banco desconhecido: ${placement}`);
    this.name = 'UnknownPlacementError';
  }
}

/**
 * Strategy de placement: mapeia `tenants.db_placement` → servidor.
 * É o que permite a topologia híbrida (servidor padrão vs dedicado no enterprise)
 * e a distribuição futura dos bancos sem tocar no código da aplicação.
 */
export class PlacementRegistry {
  private readonly placements = new Map<string, Placement>();

  constructor(placements: readonly Placement[]) {
    if (placements.length === 0) {
      throw new Error('Nenhum placement de banco configurado');
    }
    for (const placement of placements) {
      if (this.placements.has(placement.name)) {
        throw new Error(`Placement duplicado: ${placement.name}`);
      }
      this.placements.set(placement.name, placement);
    }
  }

  /** @throws UnknownPlacementError se o placement não existir. */
  get(name: string): Placement {
    const placement = this.placements.get(name);
    if (!placement) {
      throw new UnknownPlacementError(name);
    }
    return placement;
  }

  has(name: string): boolean {
    return this.placements.has(name);
  }

  names(): string[] {
    return [...this.placements.keys()];
  }
}

/** Deriva um placement de uma URL de conexão (ex.: a do CORE, para o servidor padrão). */
export function placementFromUrl(name: string, connectionString: string): Placement {
  const url = new URL(connectionString);
  return {
    name,
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}
