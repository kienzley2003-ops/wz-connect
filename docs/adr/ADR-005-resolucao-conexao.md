# ADR-005: Resolução dinâmica de conexão (Registry + Object Pool + AsyncLocalStorage)

- **Status:** Aceito
- **Data:** 2026-07-14
- **Decisores:** Kienzley Huguenin

## Contexto

Com Database Per Tenant (ADR-004), a conexão correta só é conhecida em runtime, a partir do
**subdomínio** da requisição. Precisamos: (1) descobrir o tenant, (2) obter as credenciais do
banco no CORE, (3) conectar via Drizzle sem abrir um pool por request, e (4) disponibilizar a
conexão a todos os services da cadeia sem passá-la manualmente por parâmetro.

## Decisão

Pipeline de resolução por requisição:

1. **`TenantResolutionMiddleware`** extrai o subdomínio do `Host` (fallback: header `X-Tenant` ou claim `tnt` do JWT).
2. **Lookup no CORE** (cacheado, TTL curto + invalidação) → tenant + credenciais cifradas + módulos.
3. **`TenantConnectionRegistry`** (padrões **Registry** + **Object Pool**): mantém um `pg.Pool` + instância Drizzle por `tenantId`, com **cache**, **eviction LRU**, **idle timeout** e **health check**. Cria sob demanda; nunca um pool por request.
4. **`TenantContext`** (**AsyncLocalStorage**): carrega `{ tenantId, db }` por toda a request; services chamam `getTenantDb()`.

Como a credencial no CORE inclui `host`/`porta`, **mover o banco de um tenant para outro
servidor é só atualizar o registro** — o registry recria o pool no próximo acesso, sem deploy.

## Consequências

**Positivas**

- **Zero acoplamento** entre lógica de negócio e localização física do banco.
- **Reuso de conexões** evita o custo de reconectar a cada request.
- **Isolamento**: uma request só acessa o pool do seu tenant.
- **Distribuição futura** de bancos sem alterar código (só o CORE).

**Trade-offs**

- Complexidade no registry (limites de pools, eviction, reconexão) — coberta por testes.
- `AsyncLocalStorage` exige disciplina: nada de estado global fora do contexto.
- Cache do lookup precisa de invalidação correta ao mudar credenciais/subdomínio.

## Alternativas consideradas

- **Pool por request** — simples, mas caríssimo (reconecta sempre) e esgota o Postgres.
- **Passar `db` por parâmetro** em toda função — verboso, fere DRY, propenso a erro.
- **Decorar o request do Fastify** (`request.tenantDb`) — funciona, mas obriga a passar o `request` a toda função que precisa do banco; `AsyncLocalStorage` propaga o contexto sem esse acoplamento.
