# ADR-009: Migrações por tenant + provisionamento

- **Status:** Aceito
- **Data:** 2026-07-14
- **Decisores:** Kienzley Huguenin

## Contexto

Com Database Per Tenant (ADR-004), não existe "um banco" para migrar: há o `WZ_CONNECT_CORE`
e **N** bancos de tenant. O schema dos módulos precisa ser aplicado de forma consistente a
todos os tenants, e criar um novo tenant é um processo (criar banco + migrar + seed), não um
`INSERT`. Precisamos de idempotência, resiliência (a falha de um tenant não pode travar os
demais) e rastreabilidade do que já foi aplicado em cada banco.

## Decisão

**Dois conjuntos de migração**, ambos com `drizzle-kit`:

1. **CORE** — schema do `WZ_CONNECT_CORE`, aplicado uma vez.
2. **Tenant** — schema dos módulos, aplicado a cada banco de tenant.

**Orquestrador `tenant-migrator`**:

- Lê os tenants ativos no CORE.
- Para cada banco: conecta, aplica migrações pendentes, registra o journal **por tenant**.
- **Idempotente** e **resiliente**: falha em um tenant é reportada e não bloqueia os outros; execução pode ser retomada.

**Provisionar tenant** (`POST /tenants/:id/provisionar`):

```
1. Cria o banco (servidor definido por db_placement — Strategy)
2. Aplica TODAS as migrações dos módulos habilitados
3. Seed inicial (admin do tenant, config padrão)
4. Registra credenciais cifradas (ADR-006) + subdomínio no CORE
5. Marca o tenant como 'ativo'
```

## Política obrigatória de migração destrutiva (expand/contract)

Como uma migração roda em **N** bancos, uma mudança destrutiva (`DROP`, rename, mudança de
tipo) que falhe no meio deixa os tenants com **schemas inconsistentes**, e `DROP` apaga dado
de forma irreversível. **Proibido** renomear/remover na mesma migração que introduz a forma
nova. Toda mudança de forma segue **expand/contract** (parallel change):

Exemplo — renomear `nome` → `nome_completo`:

| Passo        | Ação                                                                                  | Destrutivo?       |
| ------------ | ------------------------------------------------------------------------------------- | ----------------- |
| **Expand**   | Adiciona `nome_completo`; o código escreve nas **duas** colunas.                      | Não               |
| **Backfill** | Copia `nome` → `nome_completo`; o código passa a **ler da nova**.                     | Não               |
| **Contract** | Só após todos os tenants estáveis, remove `nome` — migração **separada e posterior**. | Sim, agora seguro |

Regras:

- Cada passo é **reversível** e pode rodar incrementalmente pelos N bancos.
- A fase **Contract** exige revisão explícita e confirmação de que nenhum tenant/versão de
  código ainda depende da estrutura antiga.
- Migrações destrutivas passam por **revisão obrigatória** em PR (dois pares de olhos).

## Consequências

**Positivas**

- Schema consistente entre todos os tenants; rollout controlado.
- Onboarding de cliente automatizado e auditável.
- Journal por tenant permite migração parcial e retomada segura.

**Trade-offs**

- Deploy passa a incluir uma etapa de "migrar todos os tenants" — janela maior conforme cresce o número de bancos; mitigável com paralelismo controlado.
- Migração destrutiva exige cuidado redobrado (roda em N bancos) — política de revisão obrigatória.

## Alternativas consideradas

- **Migração manual por banco** — inviável além de poucos tenants; propenso a divergência de schema.
- **Schema compartilhado** — eliminaria o problema, mas contraria ADR-004 (isolamento).
- **Migração lazy no primeiro acesso** — risco de latência/inconsistência em produção; preferimos migração explícita e observável.
