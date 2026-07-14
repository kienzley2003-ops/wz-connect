/** Lançado quando o subdomínio não corresponde a nenhum tenant ativo. */
export class TenantNotFoundError extends Error {
  constructor(public readonly subdomain: string) {
    super(`Tenant não encontrado para o subdomínio: ${subdomain}`);
    this.name = 'TenantNotFoundError';
  }
}
