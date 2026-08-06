# ADR-0011 — Worker Compartilhando Banco com o Backend

**Status:** Aceito
**Data:** 2026-08-05

## Contexto

O Connect precisa de processamento assíncrono para tarefas que não podem bloquear a resposta HTTP: emissão de NF-e (ADR-0010), retry de webhook, envio de e-mail (convites, avisos de trial), e jobs de retenção/hard-delete de organizações canceladas. Isso exige um app **worker** separado do backend HTTP, rodando BullMQ sobre Redis. A questão em aberto era se esse worker deveria compartilhar o mesmo Postgres do backend ou operar num banco isolado.

## Decisão

O worker **compartilha o mesmo Postgres do backend**, com suas tabelas próprias isoladas em **schema `worker_*`** (ex.: `worker_nfe_jobs`, `worker_webhook_retries`) — não um banco físico separado.

Motivação da escolha (trade-offs avaliados com o usuário):

| Critério | Compartilhar (escolhido) | Separar |
|---|---|---|
| Operação | 1 backup, 1 pool de conexões, 1 monitoramento | 2 de cada |
| Custo (self-hosted) | Baseline | +30–50% (mais RAM/disco/backup) |
| Transações cross-schema | Nativas (FK entre `worker_*` e tabelas core) | Impossíveis — duplicação de dados ou chamada HTTP interna |
| Precedente no hub | `wz-agente` já roda jobs de background no mesmo Postgres do backend | Nenhum projeto do hub faz isso hoje |
| Isolamento de falha | Um job pesado pode segurar lock e atrasar o backend | Isolamento total |

Dado que o hub é **self-hosted** (ADR-0013) e o volume esperado de jobs no MVP é baixo (emissão de nota por invoice paga, não por segundo), o ganho de isolamento de uma base separada não compensa o custo operacional e financeiro adicional.

## Consequências

**Positivas:**
- Um único Postgres para operar, uma única rotina de backup (ADR-0012).
- FK entre `worker_nfe_jobs.invoice_id` e `invoices.id` funciona nativamente — sem duplicação de estado entre dois bancos.
- Caminho de migração para banco separado permanece aberto no futuro: as tabelas `worker_*` são poucas e bem definidas, uma extração posterior é viável se o volume de jobs justificar.

**Negativas:**
- Um job mal escrito ou uma migration pesada no worker pode, em teoria, competir por recursos de conexão/lock com o backend — mitigado por manter os jobs do worker leves e por connection pooling dedicado por processo.
- Se o worker precisar escalar horizontalmente de forma independente do backend no futuro, a separação de banco pode se tornar necessária — não é uma decisão irreversível, apenas a escolha correta para o estágio atual.

## Alternativas Rejeitadas

- **Postgres separado para o worker:** rejeitado no estágio atual pelo custo desproporcional ao volume de jobs esperado, e pela ausência de precedente no hub — decisão tomada após discussão explícita de prós/contras/custo com o usuário.
- **Worker sem app separado (jobs rodando inline no backend HTTP)**: rejeitado porque bloquearia requisições HTTP durante processamento pesado (ex.: chamada à API da NFe.io) — o padrão de app separado já é usado com sucesso pelo `wz-agente` para seus próprios jobs de background.
