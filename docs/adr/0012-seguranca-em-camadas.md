# ADR-0012 — Segurança em Camadas

**Status:** Aceito
**Data:** 2026-08-05

## Contexto

O wz-connect concentra a autenticação e o billing de todo o hub — é o alvo de maior valor para um atacante entre os cinco projetos. `wz-masterfila` (ADR-008) e `wz-agente` já aplicam defesa em camadas com sucesso; o Connect precisa do mesmo princípio aplicado à sua superfície mais ampla (todo o hub passa por ele).

## Decisão

Aplicar defesa em camadas com os seguintes parâmetros, já validados em discussão com o usuário (`PRODUCT.md §7`):

1. **Rate limiting:** **global** no MVP — 200 req/min por IP, 10 req/min em `/auth/login`. Override por plano (ex.: Free mais restrito) fica para v1.1, não bloqueante para o MVP.
2. **TLS:** **HTTP puro em ambiente local de desenvolvimento** (sem certificado); **HTTPS obrigatório em qualquer ambiente remoto** (homologação e produção), via Caddy com certificado (Let's Encrypt em produção real, auto-assinado aceitável em homologação interna).
3. **CSRF, lockout, MFA:** ver ADR-0004 (auth já cobre essas camadas).
4. **CORS:** restrito à lista de domínios do hub (`*.wz-hub.com` + domínios explícitos de cada módulo consumidor) — sem wildcard `*`.
5. **Headers de segurança:** CSP estrita (sem `unsafe-inline` em produção), `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` — mesmo padrão já aplicado por `wz-agente` via nginx.
6. **Secrets:** nunca em código ou repo — variáveis de ambiente, `.env` gitignored, `.env.example` versionado (padrão já seguido por todos os módulos do hub).
7. **Backup do Postgres:** `pg_dump` diário com retenção de 30 dias, mais **snapshot obrigatório antes de qualquer migration destrutiva** (`DROP COLUMN`, `DROP TABLE`, alteração de tipo com perda de dado).
8. **Webhook do Stripe:** validação de assinatura (`Stripe-Signature` header) obrigatória — nenhum evento é processado sem verificação criptográfica de origem.

## Consequências

**Positivas:**
- Ambiente de desenvolvimento local fica simples (HTTP puro) sem abrir mão de segurança onde realmente importa (qualquer ambiente acessível pela rede).
- Rate limit global é suficiente para o MVP e não bloqueia a entrega esperando o modelo de planos amadurecer — override por plano é aditivo, não bloqueante.
- Snapshot pré-migration destrutiva é uma rede de segurança barata contra o pior cenário: perda de dado de billing/auth de todo o hub.

**Negativas:**
- Rate limit global (não por org/plano) significa que uma organização com tráfego legítimo alto pode ser limitada da mesma forma que uma pequena — aceitável no MVP, resolvido em v1.1.
- HTTP puro em dev exige disciplina de nunca expor o ambiente de desenvolvimento diretamente à internet — mitigado por ser, por definição, ambiente local.

## Alternativas Rejeitadas

- **HTTPS também em desenvolvimento local:** adiciona fricção de gerar/confiar certificados locais sem ganho de segurança real (ambiente não é acessível externamente) — decisão explícita do usuário de simplificar aqui.
- **Rate limit por organização desde o MVP:** mais justo, mas exige que o modelo de planos (ADR-0006) já esteja maduro o suficiente para definir limites por tier — adiado para v1.1 por decisão do usuário.
