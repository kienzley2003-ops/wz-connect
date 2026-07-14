# ADR-006: Cifra de credenciais de tenant (envelope encryption)

- **Status:** Aceito
- **Data:** 2026-07-14
- **Decisores:** Kienzley Huguenin

## Contexto

O `WZ_CONNECT_CORE` guarda as credenciais de acesso ao banco de cada tenant (host, porta,
usuário, senha). Essas credenciais são o ativo mais sensível do sistema: vazamento = acesso
direto aos dados de um cliente. Precisam ser protegidas em repouso e nunca expostas em logs,
URLs ou no frontend.

## Decisão

Armazenar as credenciais **cifradas** com **envelope encryption**:

- **AES-256-GCM** para cifrar o segredo (senha/connection string), com autenticação (tag GCM).
- Uma **chave-mestra (KEK)** em variável de ambiente hoje, migrável para um **KMS** (AWS KMS/Vault) sem mudar o modelo.
- A coluna `senha_cifrada` (em `tenant_databases`) guarda `iv + ciphertext + authTag`.
- Decifragem só em memória, no momento de montar a conexão; o valor claro nunca é logado nem serializado em respostas.

## Consequências

**Positivas**

- Dump do CORE não revela credenciais utilizáveis.
- Rotação de credencial de tenant sem downtime: atualiza o registro → o registry (ADR-005) recria o pool no próximo acesso.
- Caminho claro de evolução para KMS/HSM sem refatorar chamadas.

**Trade-offs**

- A KEK vira o ponto único a proteger — mitigado por gestão de segredo (env seguro → KMS) e rotação de KEK planejada.
- Pequeno custo de CPU por decifragem — desprezível e cacheável junto do pool.

## Alternativas consideradas

- **Texto puro no banco** — inaceitável para o ativo mais sensível.
- **Só variáveis de ambiente por tenant** — não escala para N tenants provisionados dinamicamente.
- **Cifra simétrica sem AEAD** (ex.: AES-CBC sem MAC) — não detecta adulteração; GCM é preferível.
