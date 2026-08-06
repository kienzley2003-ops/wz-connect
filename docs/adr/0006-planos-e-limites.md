# ADR-0006 — Planos e Limites

**Status:** Aceito
**Data:** 2026-08-05

## Contexto

O Connect precisa modelar comercialmente "o que uma organização pode fazer": quais produtos ela acessa e com quais limites numéricos (usuários, tickets/mês, orçamentos/mês, agentes, etc.). Essa modelagem precisa suportar upgrade/downgrade, planos com produtos diferentes, e um plano gratuito de entrada — decisões já fechadas em `PRODUCT.md §7`.

## Decisão

Modelo de três tabelas:

- **`plans`**: um plano comercial (`Free`, `Pro`, `Enterprise`), com `price_cents` e `billing_interval` (`month`/`year`).
- **`products`**: um produto do hub (`masterfila`, `desk`, `orc`, `agente`, futuros).
- **`plan_products`**: junção M:N — cada linha diz "este plano inclui este produto, com estes limites" (`limits` em `jsonb`, ex.: `{ "max_users": 5, "max_monthly_tickets": 500 }`). Isso permite planos que incluem só um subconjunto de produtos, e limites diferentes para o mesmo produto em planos diferentes.

**Plano Free** existe desde o MVP, com limites apertados: 1 usuário, 100 tickets/mês (masterfila), 50 orçamentos/mês (orc), 1 agente (wz-agente) — valores calibráveis via seed, não hardcoded em lógica.

Uma organização tem no máximo **uma assinatura ativa por vez** (ver ADR-0009 para o ciclo de vida da assinatura) — o plano vigente determina os produtos e limites correntes via `subscriptions.plan_id → plan_products`.

## Consequências

**Positivas:**
- Limites em JSONB por produto evitam uma explosão de colunas `max_*` na tabela `plan_products` a cada novo tipo de limite.
- Plano Free reduz atrito de entrada — cliente testa o hub sem cartão antes de decidir por um trial pago (ADR-0009 define trial com cartão para planos pagos; Free não precisa de trial).
- Mudar limites de um plano é uma operação de dados (UPDATE em `plan_products`), não deploy de código.

**Negativas:**
- Limites em JSONB não são validados pelo schema do banco — a validação de forma (`max_users` é sempre número, etc.) precisa acontecer na camada de aplicação (Zod), não no Postgres.
- Checagem de limite (ex.: "esta org já atingiu `max_users`?") exige que cada módulo consumidor implemente a contagem do seu próprio recurso e compare com o limite do SDK — o Connect não tem visibilidade de quantos tickets o `wz-masterfila` já criou, por exemplo.

## Alternativas Rejeitadas

- **Colunas fixas de limite em `plan_products`** (`max_users int`, `max_tickets int`, ...): mais fácil de validar no banco, mas exige migration a cada novo tipo de limite introduzido por um novo produto — não escala com o crescimento do catálogo.
- **Limites por organização em vez de por plano:** mais flexível (override individual), mas adiciona complexidade que não é necessária no MVP — pode ser adicionado depois como uma tabela `organization_overrides` sem quebrar o modelo atual.
