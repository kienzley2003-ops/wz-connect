import type { DashboardResponse } from '@wz/shared';

export interface Session {
  readonly id: string;
  readonly email: string;
  readonly status: string;
  /** Subdomínio do tenant, ou null em token de plataforma. */
  readonly tenant: string | null;
  /** Papel de plataforma; null para usuário comum. Libera a administração. */
  readonly platformRole: string | null;
  readonly roles: string[];
  readonly mods: string[];
}

export interface AdminTenant {
  readonly id: string;
  readonly nome: string;
  readonly slug: string;
  readonly subdominio: string;
  readonly status: 'provisionando' | 'ativo' | 'suspenso' | 'encerrado';
  readonly dbPlacement: string;
  readonly modules: string[];
}

export interface ModuleCatalogItem {
  readonly chave: string;
  readonly nome: string;
}

/** Credencial do banco, revelada só no provisionamento. */
export interface ProvisionResult {
  readonly database: string;
  readonly created: boolean;
  readonly credentials: {
    readonly host: string;
    readonly port: number;
    readonly database: string;
    readonly user: string;
    readonly password: string;
  };
}

async function errorCode(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `http_${res.status}`;
}

/** Autentica no CORE; o tenant vem do subdomínio da própria página. */
export async function login(email: string, password: string): Promise<string> {
  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await errorCode(res));
  const body = (await res.json()) as { token: string };
  return body.token;
}

/** Sessão atual: perfil + tenant + papéis + módulos habilitados. */
export async function fetchSession(token: string): Promise<Session> {
  const res = await fetch('/auth/me', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await errorCode(res));
  return (await res.json()) as Session;
}

// --- Administração de plataforma (exige platform_super_admin) ---

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function fetchTenants(token: string): Promise<AdminTenant[]> {
  const res = await fetch('/tenants', { headers: authHeaders(token) });
  if (!res.ok) throw new Error(await errorCode(res));
  return (await res.json()) as AdminTenant[];
}

export async function fetchModuleCatalog(token: string): Promise<ModuleCatalogItem[]> {
  const res = await fetch('/modules', { headers: authHeaders(token) });
  if (!res.ok) throw new Error(await errorCode(res));
  return (await res.json()) as ModuleCatalogItem[];
}

export async function createTenant(
  token: string,
  input: { nome: string; slug: string },
): Promise<AdminTenant> {
  const res = await fetch('/tenants', {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await errorCode(res));
  return (await res.json()) as AdminTenant;
}

/** Cria o banco da empresa. A credencial só volta aqui — guarde-a. */
export async function provisionTenant(token: string, id: string): Promise<ProvisionResult> {
  const res = await fetch(`/tenants/${id}/provisionar`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(await errorCode(res));
  return (await res.json()) as ProvisionResult;
}

export async function setTenantModules(
  token: string,
  id: string,
  modules: string[],
): Promise<{ modules: string[] }> {
  const res = await fetch(`/tenants/${id}/modules`, {
    method: 'PUT',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ modules }),
  });
  if (!res.ok) throw new Error(await errorCode(res));
  return (await res.json()) as { modules: string[] };
}

/** Painel consolidado do tenant (BI). */
export async function fetchDashboard(token: string): Promise<DashboardResponse> {
  const res = await fetch('/dashboard?granularity=hour&periods=24', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await errorCode(res));
  return (await res.json()) as DashboardResponse;
}
