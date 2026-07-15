export interface Session {
  readonly id: string;
  readonly email: string;
  readonly status: string;
  /** Subdomínio do tenant, ou null em token de plataforma. */
  readonly tenant: string | null;
  readonly roles: string[];
  readonly mods: string[];
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
