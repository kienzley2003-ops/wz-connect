# ADR-0005 — Entitlements via `products[]` no Token

**Status:** Aceito
**Data:** 2026-08-05

## Contexto

Cada organização do hub pode ter acesso a um subconjunto dos produtos (`masterfila`, `desk`, `orc`, `agente`, e futuros). Um módulo downstream precisa responder rapidamente "esta organização tem acesso a mim?" sem depender de uma chamada de rede síncrona ao Connect a cada requisição — isso adicionaria latência e um ponto único de falha em toda operação do hub.

## Decisão

O catálogo de produtos é **dinâmico, armazenado em banco** (tabela `products`), com seed inicial dos quatro produtos existentes — justificativa: o hub vai crescer com novos serviços, hardcoding exigiria deploy do Connect a cada novo produto.

O **JWT emitido pelo Connect carrega `products: string[]`** — a lista de `product.key` que a organização tem ativos **no momento da emissão do token**. Cada módulo faz a checagem localmente: `req.user.products.includes('masterfila')`.

Como o token vive só 15 minutos (ADR-0004), a defasagem entre "mudança de plano" e "token refletir a mudança" é de no máximo 15 minutos — aceitável para o caso de uso (não é um sistema de billing em tempo real por segundo).

Para os poucos casos que exigem consistência imediata (ex.: downgrade forçado por inadimplência crítica), o SDK expõe um método de checagem online (`connect.entitlements.check(org, product)`) que consulta o Connect diretamente, usado apenas em pontos sensíveis, não em toda requisição.

## Consequências

**Positivas:**
- Checagem de entitlement é O(1) local, sem chamada de rede na maioria dos casos.
- Catálogo dinâmico permite adicionar produtos sem alterar código do Connect.
- Janela de defasagem de 15 min é aceitável e alinhada com a vida do access token — não introduz um novo parâmetro de configuração.

**Negativas:**
- Revogação de acesso a um produto não é instantânea — usuário mantém acesso pelos minutos restantes do token atual. Mitigado pelo método de checagem online do SDK para os casos que realmente precisam de corte imediato.
- Todo novo produto do hub precisa de uma entrada em `products` e a lógica correspondente de `plan_products` (ver ADR-0006) antes de qualquer organização poder usá-lo.

## Alternativas Rejeitadas

- **Catálogo hardcoded no código do Connect:** mais simples inicialmente, mas o próprio propósito do Connect é ser central de catálogo do hub — hardcoding contradiz o objetivo declarado em `PRODUCT.md`.
- **Checagem sempre online (sem `products[]` no token):** elimina a janela de defasagem, mas adiciona uma chamada de rede síncrona a cada requisição de cada módulo — risco de latência e de o Connect virar ponto único de falha para todo o hub.
