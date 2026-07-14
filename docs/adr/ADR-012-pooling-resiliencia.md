# ADR-012: Estratégia de pooling e resiliência (PgBouncer + circuit breaker)

- **Status:** Aceito
- **Data:** 2026-07-14
- **Decisores:** Kienzley Huguenin

## Contexto

O maior risco operacional do Database Per Tenant (ADR-004) é o **esgotamento de conexões do
PostgreSQL**. Cada tenant ativo mantém um pool próprio (ADR-005); o servidor tem
`max_connections` limitado (tipicamente ~100). Com dezenas ou centenas de tenants, o sistema
**estoura** e passa a recusar conexões — falha que afeta todos os clientes daquele servidor.
Precisamos de uma estratégia explícita para o sistema **escalar sem falhar**.

## Decisão

Defesa em camadas, da mais impactante para a mais fina:

1. **PgBouncer na frente do PostgreSQL** (transaction pooling) — desacopla os pools da
   aplicação das conexões físicas do servidor: muitos "clientes lógicos" são multiplexados em
   poucas conexões reais. É a mitigação principal do risco.
2. **Pools pequenos por tenant** no `TenantConnectionRegistry` — teto de 2–5 conexões por
   tenant, com **LRU eviction** e **idle timeout** agressivo (fecha tenant inativo rápido).
3. **Sharding por placement** — distribuir os bancos de tenant entre **vários servidores
   PostgreSQL** via `db_placement` (ADR-004/005). Escala horizontal sem tocar no código.
4. **Circuit breaker + health check por tenant** — um banco doente é isolado (falha rápida) em
   vez de consumir o pool tentando reconectar; não cascateia para outros tenants.
5. **Observabilidade e alerta** — métricas de uso de pool, contagem de conexões por servidor e
   latência por tenant, com **alerta antes** de atingir o teto de `max_connections`.
6. **Cache do lookup no CORE** — subdomínio→tenant muda pouco; cache com TTL curto evita ida
   ao CORE a cada request.

## Consequências

**Positivas**

- Escala para muitos tenants sem esgotar o PostgreSQL.
- Falha de um tenant/banco é contida (circuit breaker), sem efeito dominó.
- Caminho de crescimento claro: mais tenants → mais servidores (sharding), sem refatorar.
- Problemas visíveis com antecedência (observabilidade), não só quando já falhou.

**Trade-offs**

- **PgBouncer** é mais um componente de infra para operar e monitorar.
- Transaction pooling do PgBouncer impõe restrições (ex.: prepared statements, session state) —
  o acesso via Drizzle deve respeitá-las.
- Circuit breaker e eviction adicionam complexidade ao registry — coberta por testes.

## Alternativas consideradas

- **Só pools da aplicação, sem PgBouncer** — funciona em baixa escala, mas não sobrevive a
  centenas de tenants; adia o problema em vez de resolvê-lo.
- **Uma conexão compartilhada por servidor** — quebra o isolamento e a simplicidade do modelo
  por tenant.
- **Postgres gerenciado com pooling nativo** (ex.: provedores serverless) — válido no futuro;
  não assumido agora para manter portabilidade da infra (Docker/self-hosted).
