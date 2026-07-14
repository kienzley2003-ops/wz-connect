/** Rótulos que nunca representam um tenant. */
const RESERVED = new Set(['', 'www']);

/**
 * Extrai o subdomínio (identificador do tenant) a partir do header `Host`.
 *
 * Com `baseDomain` (ex.: `wzconnect.com`), retorna o rótulo antes do domínio base.
 * Sem `baseDomain`, usa heurística de dev: suporta `<tenant>.localhost` e o primeiro
 * rótulo de hosts com 3+ níveis.
 *
 * @returns o subdomínio, ou `null` quando não há tenant resolvível.
 */
export function extractSubdomain(host: string | undefined, baseDomain?: string): string | null {
  if (!host) return null;

  const hostname = host.split(':')[0]?.trim().toLowerCase();
  if (!hostname) return null;

  let candidate: string | null = null;

  if (baseDomain) {
    const base = baseDomain.trim().toLowerCase();
    if (hostname === base) return null;
    const suffix = `.${base}`;
    if (!hostname.endsWith(suffix)) return null;
    candidate = hostname.slice(0, -suffix.length);
  } else {
    const labels = hostname.split('.');
    const last = labels[labels.length - 1];
    if (last === 'localhost' && labels.length >= 2) {
      candidate = labels.slice(0, -1).join('.');
    } else if (labels.length >= 3) {
      candidate = labels[0] ?? null;
    }
  }

  if (candidate === null || RESERVED.has(candidate)) return null;
  return candidate;
}
