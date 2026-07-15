# Architecture Decision Records — WZ Connect

Registros de decisões arquiteturais. Cada ADR é imutável depois de aceito; mudanças geram um
novo ADR que **supersede** o anterior.

| #                                               | Título                                                                     | Status |
| ----------------------------------------------- | -------------------------------------------------------------------------- | ------ |
| [ADR-001](ADR-001-monorepo-pnpm.md)             | Monorepo com pnpm workspaces                                               | Aceito |
| [ADR-002](ADR-002-fastify.md)                   | Fastify como framework backend                                             | Aceito |
| [ADR-003](ADR-003-drizzle-repository.md)        | Drizzle ORM + Repository pattern                                           | Aceito |
| [ADR-004](ADR-004-database-per-tenant.md)       | Database Per Tenant com banco central `WZ_CONNECT_CORE`                    | Aceito |
| [ADR-005](ADR-005-resolucao-conexao.md)         | Resolução dinâmica de conexão (Registry + Object Pool + AsyncLocalStorage) | Aceito |
| [ADR-006](ADR-006-cifra-credenciais.md)         | Cifra de credenciais de tenant (envelope encryption)                       | Aceito |
| [ADR-007](ADR-007-sistema-modulos.md)           | Sistema de módulos via plugins Fastify encapsulados                        | Aceito |
| [ADR-008](ADR-008-auth-global.md)               | Autenticação global (Argon2 + JWT RS256/JWKS + sessão única)               | Aceito |
| [ADR-009](ADR-009-migracoes-provisionamento.md) | Migrações por tenant + provisionamento                                     | Aceito |
| [ADR-010](ADR-010-tdd-gitflow.md)               | TDD, cobertura 85%, commit atômico e git flow                              | Aceito |
| [ADR-011](ADR-011-connect-sdk.md)               | Integração de produtos via `@wz/connect-sdk` (Adapter)                     | Aceito |
| [ADR-012](ADR-012-pooling-resiliencia.md)       | Estratégia de pooling e resiliência (PgBouncer + circuit breaker)          | Aceito |
| [ADR-013](ADR-013-bi-ingestao.md)               | Ingestão de BI por push (snapshots de janela + CQRS-lite)                  | Aceito |

## Formato

Cada ADR segue: **Contexto** (o problema/força), **Decisão** (o que foi escolhido),
**Consequências** (positivas e trade-offs) e **Alternativas consideradas**.
