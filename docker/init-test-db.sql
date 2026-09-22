-- Roda automaticamente pela imagem do Postgres (docker-entrypoint-initdb.d)
-- só na primeira inicialização de um volume vazio — cria o banco de teste
-- (wz_connect_test) ao lado do banco de dev (POSTGRES_DB), como o mesmo
-- usuário/senha já usados em desenvolvimento. Ver docs/superpowers/plans/
-- 2026-08-07-connect-session-tenancy-infra.md linha 16: a suíte de testes
-- sempre leu DATABASE_URL do ambiente — trocar o alvo nunca exigiu mudar
-- código de teste, só apontar para outro banco.
CREATE DATABASE wz_connect_test;
