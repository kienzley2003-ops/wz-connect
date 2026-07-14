# ADR-004: Database Per Tenant com banco central `WZ_CONNECT_CORE`

- **Status:** Aceito
- **Data:** 2026-07-14
- **Decisores:** Kienzley Huguenin
- **Supersede:** a proposta v0.1 (banco compartilhado com `organizacao_id`)

## Contexto

O WZ Connect atende múltiplas empresas (tenants). Precisamos decidir a estratégia de
isolamento de dados. Requisitos: isolamento forte, backups individuais, possibilidade de
distribuir bancos em servidores diferentes e conformidade (LGPD/enterprise). A v0.1 propunha
um banco único compartilhado filtrando por `organizacao_id`.

## Decisão

Adotar **Database Per Tenant**: cada empresa tem seu **próprio banco PostgreSQL**. Um banco
central **`WZ_CONNECT_CORE`** guarda o que é global:

- autenticação global (usuários, credenciais);
- tenants, planos, módulos, subdomínios;
- **credenciais dos bancos de tenant** (cifradas — ver ADR-006);
- auditoria da plataforma.

Cada banco de tenant contém apenas os dados de negócio daquela empresa (tabelas dos módulos
habilitados).

## Consequências

**Positivas**

- **Isolamento físico**: impossível vazar dados entre empresas por query mal filtrada.
- **Backup/restore por empresa** sem afetar as demais.
- **Escala horizontal**: bancos distribuíveis em servidores distintos (ver ADR-005) sem mudar código.
- **Compliance** facilitado (separação física por cliente).
- **Blast radius menor**: corrupção/carga de um tenant não afeta os outros.

**Trade-offs**

- **Migrações em N bancos** — exige orquestrador dedicado (ADR-009).
- **Conexões dinâmicas** — não há um pool único; precisa de registry com cache/eviction (ADR-005).
- **Provisionamento** de tenant é um processo (criar banco + migrar + seed), não um `INSERT`.
- Custo operacional de muitos bancos — mitigado por placement e automação.

## Alternativas consideradas

- **Banco único + `organizacao_id`** (v0.1) — simples, mas isolamento só lógico; risco de vazamento; backup/restore por cliente inviável; escala vertical.
- **Schema por tenant** (mesmo banco, schemas diferentes) — meio-termo, mas ainda um ponto único de falha e limites de escala do servidor; migração e distribuição menos flexíveis.
