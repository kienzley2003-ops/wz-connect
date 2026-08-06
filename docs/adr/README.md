# Architecture Decision Records

Registros das decisões arquiteturais do WZ Connect (Auth + Tenancy + Catálogo/Planos do wz-hub).

Cada ADR descreve: o contexto do problema, a decisão tomada, as consequências e as alternativas rejeitadas.

| ADR | Título | Status |
|---|---|---|
| [0001](0001-fastify-drizzle-postgres.md) | Stack: Fastify + Drizzle + PostgreSQL | Aceito |
| [0002](0002-pnpm-monorepo-sdk-workspace.md) | pnpm Monorepo com SDK Publicável | Aceito |
| [0003](0003-tenancy-subdominio-jwt.md) | Tenancy via Subdomínio + JWT | Aceito |
| [0004](0004-auth-jwt-refresh-csrf-mfa-lockout.md) | Autenticação: JWT + Refresh Rotativo + CSRF + MFA + Lockout | Aceito |
| [0005](0005-entitlements-products-no-token.md) | Entitlements via `products[]` no Token | Aceito |
| [0006](0006-planos-e-limites.md) | Planos e Limites | Aceito |
| [0007](0007-single-session-enforcement.md) | Single-Session Enforcement | Aceito |
| [0008](0008-auditoria-central.md) | Auditoria Central | Aceito |
| [0009](0009-billing-stripe-webhook.md) | Billing via Stripe + Webhook | Aceito |
| [0010](0010-nfe-via-nfeio.md) | Nota Fiscal via NFe.io | Aceito |
| [0011](0011-worker-compartilhando-db.md) | Worker Compartilhando Banco com o Backend | Aceito |
| [0012](0012-seguranca-em-camadas.md) | Segurança em Camadas | Aceito |
| [0013](0013-observabilidade-pino-otel.md) | Observabilidade: Pino + OpenTelemetry | Aceito |

## Como Criar um Novo ADR

1. Copie o template abaixo
2. Nomeie o arquivo `NNNN-titulo-kebab.md` com o próximo número sequencial
3. Adicione a linha na tabela acima

```markdown
# ADR-NNNN — Título

**Status:** Proposto | Aceito | Depreciado | Substituído por ADR-NNNN
**Data:** AAAA-MM-DD

## Contexto

O problema que motivou esta decisão.

## Decisão

O que foi decidido e por quê.

## Consequências

**Positivas:**
- ...

**Negativas:**
- ...

## Alternativas Rejeitadas

- **Opção A:** por que não
```
