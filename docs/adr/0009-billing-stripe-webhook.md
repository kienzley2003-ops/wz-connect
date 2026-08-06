# ADR-0009 — Billing via Stripe + Webhook

**Status:** Aceito
**Data:** 2026-08-05

## Contexto

O usuário foi explícito sobre o requisito central deste ADR: billing precisa ser **100% automático** — "cliente coloca cartão, cartão passou alegria, cartão não passou corta". Nenhum processo manual de validar pagamento ou cortar acesso é aceitável. Isso exige um provedor de pagamento que gerencie cobrança recorrente, retry de falha, e dunning (régua de cobrança) nativamente — reimplementar essa lógica do zero é um projeto por si só e historicamente fonte de bugs financeiros graves.

## Decisão

Usar **Stripe** como provedor de billing, integrado via **webhook** — o Connect nunca decide sozinho "o cliente pagou", ele reage a eventos que o Stripe envia.

Parâmetros de produto já fechados (`PRODUCT.md §7`):
- **Moeda:** BRL apenas no MVP, sem multi-moeda.
- **Trial:** 14 dias, **com cartão obrigatório** no cadastro (melhor qualificação de lead que trial sem cartão).
- **Downgrade:** agendado para o fim do ciclo de cobrança atual — nunca imediato.
- **Cancelamento → reativação:** janela de 30 dias onde reativar não perde dados; após isso, mais 90 dias de retenção legal antes do hard-delete (ver ADR-0011 para o job de retenção).
- **Estorno/refund no MVP:** feito manualmente pelo admin do hub direto no Stripe Dashboard — mas o schema (tabela `payments`, ver schema Drizzle) já é desenhado para suportar um endpoint interno de refund no Connect na v1.1, sem migration adicional.

Fluxo de eventos tratados via webhook (`POST /webhooks/stripe`, com **verificação de assinatura obrigatória**):

| Evento Stripe | Efeito no Connect |
|---|---|
| `customer.subscription.created` | Confirma assinatura, ativa entitlement |
| `invoice.paid` | Marca invoice paga, dispara emissão de NF-e (ADR-0010) |
| `invoice.payment_failed` | Marca `past_due`; produto continua acessível por N dias (configurável por plano) até Stripe esgotar Smart Retries |
| `customer.subscription.trial_will_end` | Dispara e-mail de aviso (3 dias antes do fim do trial) |
| `customer.subscription.updated` | Sincroniza `status`/`current_period_end`/`plan_id` |
| `customer.subscription.deleted` | Marca `canceled`, inicia contagem da janela de reativação |
| `charge.refunded` | Registra o estorno feito manualmente no Stripe Dashboard |

Todo evento recebido é gravado em `webhook_events` com `external_id` único (o `event.id` do Stripe) **antes** de processar — garante idempotência caso o Stripe reenvie o mesmo evento (comportamento documentado da API deles).

## Consequências

**Positivas:**
- Zero intervenção manual no ciclo normal de cobrança — exatamente o requisito do usuário.
- Stripe cobre PCI compliance, retry inteligente de cartão recusado, e suporta Pix/boleto nativamente no Brasil — não precisamos implementar nenhum desses fluxos.
- Idempotência via `webhook_events` protege contra duplicidade de processamento (ex.: NF-e emitida duas vezes pela mesma invoice).

**Negativas:**
- Dependência forte de um provedor externo — indisponibilidade do Stripe (rara, mas possível) trava novas assinaturas e mudanças de plano.
- Refund manual no MVP significa que o admin do hub ainda depende de acessar o Stripe Dashboard para esse caso específico — mitigado pelo plug já preparado no schema.

## Alternativas Rejeitadas

- **Gateway de pagamento nacional (PagSeguro, Mercado Pago, etc.) desde o dia 1:** Stripe tem SDK mais maduro para SaaS recorrente e já suporta Pix/boleto no Brasil — trocar de gateway depois é mais fácil que sustentar lógica de recorrência caseira agora.
- **Cobrança sem webhook, com polling periódico do status da assinatura:** adiciona latência (o corte de acesso demoraria até o próximo poll) e desperdiça chamadas de API — webhook é o padrão recomendado pelo próprio Stripe para este caso.
- **Implementar régua de cobrança/dunning própria:** rejeitada — Stripe Smart Retries já resolve isso nativamente, reimplementar é reinventar a roda com risco financeiro.
