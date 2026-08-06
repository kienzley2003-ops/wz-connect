# ADR-0013 — Observabilidade: Pino + OpenTelemetry

**Status:** Aceito
**Data:** 2026-08-05

## Contexto

O Connect é um ponto de agregação de requisições vindas de múltiplos módulos do hub — depurar um problema (ex.: "por que este usuário não conseguiu logar no wz-masterfila") pode exigir rastrear uma requisição que atravessa o módulo consumidor, o Connect, e potencialmente o worker (webhook/NF-e). Logs isolados por serviço, sem correlação, tornam esse rastreamento lento e manual.

## Decisão

Adotar **Pino** para logging estruturado (já vem integrado ao Fastify, zero configuração adicional de transporte) e **OpenTelemetry (OTEL) para tracing distribuído desde o dia 1** — não como evolução futura.

Escopo do MVP:
- Todo log estruturado em JSON via Pino, com `requestId` correlacionado.
- Spans OTEL abrangendo: requisição HTTP → validação de auth → query ao banco → chamada a serviço externo (Stripe, NFe.io) → resposta.
- Exportação de traces para um backend OTEL self-hosted (Jaeger ou similar, a definir na implementação) — consistente com a decisão de hospedagem self-hosted (ver Alternativas).
- Worker (BullMQ) também instrumentado — um job de emissão de NF-e gera um trace correlacionável ao webhook do Stripe que o originou.

## Consequências

**Positivas:**
- Debugging de problemas cross-módulo (auth, billing) fica rastreável desde o primeiro dia — evita a situação comum de "só percebemos que precisávamos de tracing depois que já era tarde para instrumentar retroativamente".
- Pino é praticamente gratuito em termos de setup (Fastify já usa por padrão) — não adiciona atrito ao ADR-0001.
- Correlação de logs e traces facilita suporte quando o master impersona uma organização (ADR-0008) e precisa investigar um problema relatado pelo cliente.

**Negativas:**
- OTEL desde o dia 1 é mais setup inicial do que "adicionar depois se precisar" — trade-off aceito conscientemente pelo usuário, dado o valor de debugging cross-módulo em um sistema que é, por natureza, um hub de integração.
- Self-hosting do backend de tracing (Jaeger ou equivalente) é mais um serviço a operar na infraestrutura self-hosted (ADR consistente com a decisão de hospedagem, mas soma ao custo operacional total).

## Alternativas Rejeitadas

- **Só Pino, sem tracing (adicionar OTEL depois se necessário):** era a expectativa natural de "MVP enxuto", mas o usuário decidiu explicitamente por OTEL desde o dia 1 — o custo de instrumentar retroativamente um sistema já em produção é maior que o custo de configurar desde o início.
- **SaaS de observabilidade gerenciado (Datadog, New Relic):** contradiz a decisão de hospedagem self-hosted (ver ADR de billing/hospedagem em `PRODUCT.md §7` #28) e adiciona custo recorrente em dólar não necessário no estágio atual.
