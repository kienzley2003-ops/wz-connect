-- Blinda o WZ_CONNECT_CORE: só o dono e o superusuário conectam.
--
-- Por que é necessário: no PostgreSQL o papel PUBLIC recebe CONNECT em todo
-- banco por padrão. Sem este REVOKE, a credencial dedicada de QUALQUER tenant
-- abriria o banco central — que guarda os usuários e as credenciais (cifradas)
-- de todos os tenants. Verificado por E2E antes e depois da correção.
--
-- Aditivo e idempotente (expand — ADR-009): não altera dados nem estrutura.
-- Usa current_database() para não fixar o nome do banco (varia por ambiente).
DO $$
BEGIN
  EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', current_database());
END
$$;
