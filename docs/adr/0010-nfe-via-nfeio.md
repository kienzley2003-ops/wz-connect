# ADR-0010 — Nota Fiscal via NFe.io

**Status:** Aceito
**Data:** 2026-08-05

## Contexto

Diferente da maioria dos SaaS que adiam emissão de nota fiscal para uma fase 2, o usuário definiu que **nota fiscal é mandatório desde o dia 1** — não é opcional no MVP. Toda cobrança recorrente processada pelo Stripe (ADR-0009) precisa gerar uma NF-e válida para o cliente brasileiro.

## Decisão

Integrar com **NFe.io** — API voltada especificamente para emissão fiscal em SaaS brasileiros (em vez de players mais generalistas como Bling, focados em varejo/e-commerce).

Fluxo:
1. Webhook `invoice.paid` do Stripe (ADR-0009) é processado pelo backend.
2. Um job é enfileirado no worker (ver ADR-0011): `worker_nfe_jobs` com `invoice_id`, `status = 'pending'`.
3. O worker chama a API da NFe.io para emitir a nota, associada aos dados fiscais da organização (`organizations.cnpj`, `billing_address`).
4. Resultado é gravado de volta em `invoices.nfe_io_id` e `invoices.nfe_status` (`pending` → `processing` → `authorized`/`denied`/`error`).
5. Em caso de erro, o job é reprocessado com backoff (mesmo padrão de retry do webhook, ver ADR-0011) — emissão de nota **nunca falha silenciosamente**.

A nota é emitida **uma vez por invoice paga** — não há emissão "sob demanda" pelo cliente; o cliente apenas consulta/baixa a nota já emitida (`invoice_url` do Stripe + link da nota da NFe.io ficam expostos juntos na tela de Assinatura).

## Consequências

**Positivas:**
- Compliance fiscal desde o primeiro cliente pagante — sem risco de acumular passivo fiscal por adiar a decisão.
- Emissão como job assíncrono (não bloqueia o webhook do Stripe) — falha na NFe.io não impede o Connect de ativar o entitlement do cliente.
- Escopo claro: 1 invoice paga = 1 nota emitida, sem ambiguidade sobre quando emitir.

**Negativas:**
- Mais um provedor externo do qual o negócio depende — indisponibilidade da NFe.io atrasa emissão (mitigado pelo retry assíncrono, o cliente não é bloqueado por isso).
- Dados fiscais da organização (CNPJ, endereço) precisam ser coletados e validados no onboarding ou antes da primeira cobrança — se ausentes, a emissão falha e fica pendente até o cliente completar o cadastro fiscal.

## Alternativas Rejeitadas

- **eNotas:** API similar à NFe.io, também viável — usuário optou por NFe.io diretamente, sem necessidade de comparação mais profunda dado que ambas atendem ao requisito.
- **Bling:** mais focado em varejo/e-commerce com estoque físico — não é o encaixe natural para faturamento recorrente de SaaS.
- **Adiar emissão fiscal para fase 2:** era a sugestão inicial da IA, **explicitamente rejeitada pelo usuário** — nota fiscal é requisito de dia 1, não negociável.
