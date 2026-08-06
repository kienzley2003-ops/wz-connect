# ADR-0008 — Auditoria Central

**Status:** Aceito
**Data:** 2026-08-05

## Contexto

Hoje cada produto do hub mantém seu próprio log de auditoria isolado (`wz-masterfila.auditoria`, `wz-agente.audit_logs`) — não existe visão consolidada de "o que aconteceu nesta organização, em qualquer produto". Além disso, o Connect introduz uma capacidade sensível nova: **impersonation** (o master do hub logar como admin de uma organização para dar suporte, decisão fechada em `PRODUCT.md §7` #22) — que precisa ser auditável de forma inequívoca.

## Decisão

O Connect mantém uma tabela **`audit_events`** central, e cada módulo do hub **escreve diretamente nela via `@wz/connect-sdk`** (`connect.audit.log({ action, target, metadata })`) — não é um sistema de fila de eventos assíncrono, é uma chamada HTTP síncrona do módulo para o Connect no momento da ação sensível.

Cada evento carrega:
- `organization_id` (nullable — eventos globais do hub, ex.: criação de plano, não têm org)
- `actor_id` — quem executou a ação
- `impersonated_by` (nullable) — se a ação foi feita durante uma sessão de impersonation, quem é o master por trás
- `product` — qual módulo gerou o evento (`connect`, `masterfila`, `desk`, `orc`, `agente`)
- `action`, `target`, `metadata` (jsonb) — o quê e em quê
- `ip`, `user_agent`, `created_at`

Módulos continuam mantendo seus próprios logs locais para consultas rápidas específicas do domínio (ex.: `wz-masterfila.auditoria` continua existindo) — `audit_events` do Connect é a visão **cross-módulo**, não uma substituição dos logs internos de cada produto.

## Consequências

**Positivas:**
- Visão única de "tudo que aconteceu nesta organização" para suporte e compliance, sem precisar consultar quatro bancos diferentes.
- Impersonation fica auditável desde o desenho — nenhuma ação do master fica sem rastro de quem realmente a executou.
- Escrita direta (não fila) simplifica a implementação inicial — sem necessidade de infraestrutura de mensageria para este caso de uso.

**Negativas:**
- Escrita síncrona ao Connect a cada ação sensível adiciona uma chamada de rede à latência da ação original nos módulos consumidores — aceitável porque auditoria só cobre ações administrativas, não o caminho quente de uso (ex.: emitir uma senha no totem do `wz-masterfila` não gera evento de auditoria; mudar uma configuração, sim).
- Se o Connect estiver fora do ar, a chamada de auditoria falha — decisão de produto necessária no momento da implementação: bloquear a ação original até a auditoria confirmar, ou logar localmente e sincronizar depois (fica para ADR futuro na fase de implementação, não bloqueante para o MVP).

## Alternativas Rejeitadas

- **Auditoria via fila assíncrona (BullMQ) desde o dia 1:** mais resiliente a indisponibilidade do Connect, mas adiciona complexidade operacional que não se justifica no volume de eventos de auditoria administrativa esperado no MVP. Pode migrar para fila se o volume crescer.
- **Cada módulo mantém auditoria isolada, sem visão central:** rejeitada — é exatamente o problema que motivou este ADR.
