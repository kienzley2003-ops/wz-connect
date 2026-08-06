/**
 * Contrato entre as Frentes A (Auth) e B (Billing) — ver plano de divisão do
 * MVP. A Frente A consome esta interface para montar o JWT (campo `products`,
 * ADR 0005); a Frente B implementa a versão real, lendo `subscriptions` +
 * `plan_products`.
 *
 * Durante o desenvolvimento isolado de cada frente, um stub trivial
 * (retornando `{ planId: null, products: [] }`) é suficiente — a troca pela
 * implementação real acontece no composition root do backend na integração
 * final, sem exigir refactor de nenhum dos dois lados.
 */
export interface EntitlementsResolver {
  getActiveEntitlements(organizationId: string): Promise<{
    planId: string | null
    products: string[]
  }>
}
