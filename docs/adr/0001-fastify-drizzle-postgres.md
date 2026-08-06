# ADR-0001 — Stack: Fastify + Drizzle + PostgreSQL

**Status:** Aceito
**Data:** 2026-08-05

## Contexto

O wz-connect é o sistema de Auth + Tenancy + Catálogo/Planos do wz-hub. Precisa de uma stack backend capaz de sustentar alto throughput (toda requisição de todo módulo do hub passa por ele para validar entitlement), com acesso type-safe ao banco e migrations versionadas. Os quatro produtos existentes do hub (`wz-masterfila`, `wz-desk`, `wz-orc`, `wz-agente`) já usam Node.js + Postgres, três deles já usam Fastify + Drizzle.

## Decisão

Usar **Node.js 20 LTS + Fastify 5.x + Drizzle ORM + PostgreSQL 16**, replicando a stack já validada em `wz-masterfila` e `wz-agente`.

Componentes adicionais específicos do Connect:
- **Zod** para validação de schemas (single source of truth entre body, response e tipos TS).
- **Redis** (via `ioredis`) para cache de entitlements/planos e fila de jobs do worker (ver ADR-0011).
- **BullMQ** para o worker de billing/NF-e/e-mail (app separado, ver ADR-0011).
- **`@fastify/swagger` + `@fastify/swagger-ui`** em `/api/v1/docs`, mesmo padrão de `wz-masterfila`.

## Consequências

**Positivas:**
- Time já tem know-how acumulado em Fastify + Drizzle nos outros três projetos — zero curva de aprendizado.
- Migrations como SQL versionado, revisável em PR.
- Sem binário nativo pesado (ao contrário de Prisma) — importante para imagens Docker enxutas.
- Zod permite reaproveitar o mesmo schema de validação no SDK público (`packages/connect-sdk`) e no backend.

**Negativas:**
- Fastify + Drizzle não têm um "admin UI" pronto (ao contrário de frameworks fullstack) — o Hub Admin (`apps/frontend`) precisa ser construído do zero.
- Redis é uma peça de infra a mais para operar (mitigado: já é um serviço leve e comum em VPS self-hosted).

## Alternativas Rejeitadas

- **NestJS** (usado em `wz-desk`): mais estrutura/DI, mas overhead desnecessário para um serviço que é, em essência, auth + billing + catálogo — não precisamos do ecossistema de módulos do Nest aqui.
- **Prisma ORM:** binary engine obrigatório, problemático em imagens Docker Alpine, geração de código pós-install — mesmo motivo já rejeitado em `wz-masterfila` ADR-003.
- **MySQL/outro banco:** todos os módulos do hub já rodam Postgres; trocar de banco só no Connect criaria fragmentação operacional sem ganho.
