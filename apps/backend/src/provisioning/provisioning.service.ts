import { tenantDatabaseName } from './tenant-database-name.js';
import { tenantRoleName } from './tenant-role.js';
import type { Placement } from './placement.js';

export interface TenantRecord {
  readonly id: string;
  readonly slug: string;
  readonly subdominio: string;
  readonly status: 'provisionando' | 'ativo' | 'suspenso' | 'encerrado';
  readonly dbPlacement: string;
}

export interface TenantDbCredentialsRow {
  readonly host: string;
  readonly porta: number;
  readonly dbname: string;
  readonly usuario: string;
  readonly senhaCifrada: string;
  readonly servidor: string;
}

export class TenantNotFoundError extends Error {
  constructor(public readonly tenantId: string) {
    super(`Tenant não encontrado: ${tenantId}`);
    this.name = 'TenantNotFoundError';
  }
}

export class TenantAlreadyActiveError extends Error {
  constructor(public readonly tenantId: string) {
    super(`Tenant já está ativo (provisionado): ${tenantId}`);
    this.name = 'TenantAlreadyActiveError';
  }
}

export interface ProvisioningDeps {
  readonly findTenant: (tenantId: string) => Promise<TenantRecord | null>;
  readonly resolvePlacement: (name: string) => Placement;
  /** Cria o banco; `already_exists` mantém a operação idempotente. */
  readonly createDatabase: (
    placement: Placement,
    dbName: string,
  ) => Promise<'created' | 'already_exists'>;
  /** Senha aleatória para a role dedicada do tenant. */
  readonly generatePassword: () => string;
  /** Cria/rotaciona a role dedicada e a torna dona do banco do tenant. */
  readonly ensureRole: (
    placement: Placement,
    dbName: string,
    roleName: string,
    password: string,
  ) => Promise<void>;
  readonly migrateTenantDb: (placement: Placement, dbName: string) => Promise<void>;
  readonly seedTenantDb: (
    placement: Placement,
    dbName: string,
    tenant: TenantRecord,
  ) => Promise<void>;
  /** Cifra a senha do banco antes de guardar no CORE (ADR-006). */
  readonly encrypt: (plain: string) => string;
  readonly saveCredentials: (tenantId: string, creds: TenantDbCredentialsRow) => Promise<void>;
  readonly activateTenant: (tenantId: string) => Promise<void>;
}

/** Credencial do tenant em texto puro — revelada UMA vez (ver {@link ProvisionResult}). */
export interface RevealedCredentials {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly password: string;
}

export interface ProvisionResult {
  readonly tenantId: string;
  readonly database: string;
  readonly placement: string;
  /** false quando o banco já existia (re-execução). */
  readonly created: boolean;
  /**
   * Credencial da role do tenant em texto puro, **revelada só aqui**.
   *
   * É como um produto separado (ex.: MasterFila) recebe acesso ao banco do
   * tenant: o operador a guarda no cofre do produto no momento do
   * provisionamento. Não existe endpoint de credencial em runtime — no CORE ela
   * fica apenas cifrada. Para reemitir, rotacione (novo provisionamento gera
   * senha nova).
   */
  readonly credentials: RevealedCredentials;
}

/**
 * Provisiona o banco de um tenant fim-a-fim (ADR-009):
 * valida → cria banco no placement → migra → seed → registra credenciais
 * cifradas no CORE → ativa o tenant.
 *
 * As credenciais e a ativação só acontecem **depois** de migrar e seedar: se
 * algo falhar no meio, o tenant não vira 'ativo' e não passa a receber tráfego.
 */
export async function provisionTenant(
  deps: ProvisioningDeps,
  tenantId: string,
): Promise<ProvisionResult> {
  const tenant = await deps.findTenant(tenantId);
  if (!tenant) {
    throw new TenantNotFoundError(tenantId);
  }
  if (tenant.status === 'ativo') {
    throw new TenantAlreadyActiveError(tenantId);
  }

  // Valida slug/role (e o placement) antes de qualquer efeito colateral.
  const dbName = tenantDatabaseName(tenant.slug);
  const roleName = tenantRoleName(tenant.slug);
  const placement = deps.resolvePlacement(tenant.dbPlacement);

  const createResult = await deps.createDatabase(placement, dbName);

  // Role dedicada e dona do banco: a credencial do tenant não abre os outros.
  const password = deps.generatePassword();
  await deps.ensureRole(placement, dbName, roleName, password);

  // Migra/seeda COMO a role, para ela ser dona dos objetos que cria.
  const asTenantRole: Placement = {
    name: placement.name,
    host: placement.host,
    port: placement.port,
    user: roleName,
    password,
  };
  await deps.migrateTenantDb(asTenantRole, dbName);
  await deps.seedTenantDb(asTenantRole, dbName, tenant);

  await deps.saveCredentials(tenantId, {
    host: placement.host,
    porta: placement.port,
    dbname: dbName,
    usuario: roleName,
    senhaCifrada: deps.encrypt(password),
    servidor: placement.name,
  });
  await deps.activateTenant(tenantId);

  return {
    tenantId,
    database: dbName,
    placement: placement.name,
    created: createResult === 'created',
    credentials: {
      host: placement.host,
      port: placement.port,
      database: dbName,
      user: roleName,
      password,
    },
  };
}
