# ADR-013: Ingestão de BI por push (snapshots de janela + CQRS-lite)

- **Status:** Aceito
- **Data:** 2026-07-14
- **Decisores:** Kienzley Huguenin

## Contexto

O WZ Connect precisa de um **painel consolidado** com métricas de todos os módulos de uma
empresa. Os dados de negócio vivem no **banco de cada tenant** (ADR-004), e alguns produtos
rodam **fora** do Connect (ADR-011). A decisão de alto nível "BI por push" já existia
(`ARQUITETURA.md` §16), mas **nunca virou ADR** nem schema — a tabela `metric_snapshots` ficou
para trás na revisão v0.2. Este ADR fecha essa lacuna.

Alternativa natural seria o Connect **varrer os bancos de tenant** e calcular as métricas: ele
tem a credencial de todos. Foi descartada — obrigaria o Connect a conhecer o schema interno de
cada produto, quebrando a fronteira que o sistema de módulos (ADR-007) existe para manter.

## Decisão

**Push de snapshots de janela**, com **CQRS-lite** (escrita e leitura separadas):

- O módulo/produto reporta o **valor agregado de uma janela** (`hour`/`day`) — não eventos
  avulsos: `POST /metrics/ingest`.
- O CORE guarda em `metric_snapshots`, com **unique(tenant, módulo, métrica, granularidade,
  bucket)**. Reenviar a mesma janela **sobrescreve** → ingestão idempotente, reprocessamento
  seguro.
- O bucket é **normalizado no servidor** (`toBucket`, sempre UTC): não se confia na janela que
  o cliente mandou, e o fuso de quem reporta não muda o agrupamento.
- O **tenant sai do token** (claim `tnt`), nunca do corpo — um produto não reporta em nome de
  outra empresa.
- Só módulo **contratado** pelo tenant pode reportar (403 `module_not_enabled`).
- Leitura: `GET /dashboard` agrega com `summarize` (função pura) — o _read model_.
- Produtos externos usam `reportMetrics` do `@wz/connect-sdk`, com o **token do usuário**.

## Consequências

**Positivas**

- **Fronteira preservada**: o Connect não conhece o schema interno de nenhum produto.
- **Idempotente por construção**: o unique + upsert eliminam dupla contagem, o pesadelo clássico
  de pipeline de métricas.
- **Volume baixo**: uma linha por (tenant, módulo, métrica, janela) — não por evento.
- Escrita e leitura evoluem separadas (CQRS-lite) sem overkill de event store.

**Trade-offs**

- **Granularidade fixa** (hora/dia): não dá para "furar" o dado até o evento individual. Se um
  dia isso for preciso, é outro pipeline (e outro ADR).
- **Depende do produto reportar**: se ele não empurrar, o painel fica vazio — o Connect não tem
  como saber que faltou dado.
- ⚠️ **Job de fundo não tem token**: o push usa o token do usuário, então só acontece durante
  requests reais. Reporte periódico sem usuário exigiria credencial máquina-a-máquina,
  deliberadamente não construída (ver emenda do ADR-011). Aceito por ora; se virar necessidade,
  vale um ADR de service accounts.

## Alternativas consideradas

- **Connect varre os bancos de tenant** — sem push e sempre fresco, mas acopla o Connect ao
  schema interno de cada produto e quebra a fronteira do ADR-007.
- **Ingestão de eventos crus** (um registro por ticket) — permite qualquer recorte depois, mas
  multiplica o volume por ordens de grandeza e traz dedupe/ordenação para o CORE.
- **Fila/stream (outbox + broker)** — mais robusto sob carga, mas exige infraestrutura que o
  estágio atual não justifica. Continua sendo o caminho se o push HTTP apertar.
