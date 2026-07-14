# ADR-008: Autenticação global (Argon2 + JWT RS256/JWKS + sessão única)

- **Status:** Aceito
- **Data:** 2026-07-14
- **Decisores:** Kienzley Huguenin

## Contexto

A autenticação é **global**, centralizada no `WZ_CONNECT_CORE`. Os módulos internos e o
MasterFila (app separado — ADR-011) precisam confiar no token emitido pelo Connect sem
compartilhar segredos. O tenant ativo é definido pelo subdomínio (ADR-005) e precisa ser
amarrado ao token para evitar uso cruzado.

## Decisão

- **Login no CORE**: e-mail + senha com hash **Argon2**; **lockout** após 5 tentativas por 15 min (`tentativas_login`, `bloqueado_ate`).
- **JWT assinado com RS256**: chave privada só no CORE; chave pública publicada em **`/.well-known/jwks.json`** (padrão JWKS).
- **Claims**: `sub` (usuário global), `tnt` (tenant/subdomínio), `roles`, `mods` (módulos habilitados).
- **Conferência subdomínio × `tnt`**: o middleware valida que o token pertence ao tenant do subdomínio.
- **Sessão única**: `sessao_ativa_id` no usuário; novo login invalida o anterior (herdado do MasterFila).
- **Rotação de chaves** de assinatura via tabela `signing_keys` (`kid`, status), sem downtime.

## Consequências

**Positivas**

- **Sem segredo compartilhado**: produtos validam com a chave pública; rotação não exige redeploy dos consumidores.
- Padrão de mercado (OIDC-compatível) facilita integrações futuras e de terceiros.
- Amarração tenant×token bloqueia reutilização de token entre empresas.

**Trade-offs**

- Gerir chaves RSA e JWKS (rotação, retirada) é mais complexo que HMAC — justificado pela ausência de segredo compartilhado.
- Revogação de JWT exige lista/introspecção ou tempo de vida curto + refresh — resolvido com access token curto + refresh no CORE.

## Alternativas consideradas

- **JWT HMAC (HS256)** — simples, mas exige segredo compartilhado com cada consumidor; rotação dolorosa; pior superfície de ataque.
- **Sessão em servidor (cookie + store)** — dificulta o consumo por app separado (MasterFila) e por múltiplos runtimes.
- **IdP terceiro (Auth0/Keycloak)** — poderoso, mas adiciona dependência externa e custo; auth é core do produto.
