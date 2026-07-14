# ADR-003: Drizzle ORM + Repository pattern

- **Status:** Aceito
- **Data:** 2026-07-14
- **Decisores:** Kienzley Huguenin

## Contexto

Precisamos de acesso a PostgreSQL type-safe, com schema versionado e migrações, funcionando
tanto para o banco central (`WZ_CONNECT_CORE`) quanto para **N** bancos de tenant criados
dinamicamente. A conexão do tenant é resolvida em runtime (ADR-005), então o ORM precisa
aceitar uma instância de conexão construída sob demanda — não um singleton global.

## Decisão

Usar **Drizzle ORM** e envolver o acesso a dados em **repositories** por agregado.

- Schemas Drizzle definidos uma vez por módulo/domínio (`schema.ts`) e reutilizados em todos os bancos de tenant.
- Repositories recebem a instância Drizzle do **contexto de tenant** (`getTenantDb()`), nunca importam uma conexão global.
- Queries do CORE usam a conexão dedicada do CORE.

## Consequências

**Positivas**

- Type-safety fim-a-fim sem camada de abstração pesada; SQL previsível.
- Drizzle aceita múltiplas conexões/instâncias — casa com database-per-tenant.
- Repository isola o domínio do ORM: testes unitários usam fakes; troca de detalhe de persistência não vaza para services.
- `drizzle-kit` gera migrações versionadas (ver ADR-009).

**Trade-offs**

- Repository adiciona uma camada — mitigado mantendo repositories finos (sem regra de negócio).
- Drizzle é mais novo que TypeORM/Prisma; ecossistema menor — aceitável e já validado no MasterFila.

## Alternativas consideradas

- **Prisma** — client gerado e singleton por datasource dificultam conexões dinâmicas por tenant; pesa mais em runtime.
- **TypeORM** — DataSources múltiplos são possíveis mas verbosos; padrão Active Record encoraja acoplamento.
- **Drizzle sem Repository** — perde testabilidade e permite lógica de negócio vazar para controllers.
