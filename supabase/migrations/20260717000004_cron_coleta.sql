-- Licitaplus — Fase 3: agendamento da coleta via pg_cron + pg_net
--
-- O job lê a URL do projeto e a service role key do Vault do Supabase
-- (nenhum segredo fica na migration). Antes do primeiro disparo, criar os
-- segredos no SQL Editor do projeto (ver README):
--   select vault.create_secret('https://SEU_REF.supabase.co', 'project_url');
--   select vault.create_secret('SUA_SERVICE_ROLE_KEY', 'service_role_key');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'licitaplus-coletar',
  '*/30 * * * *',  -- a cada 30 minutos
  $$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets
       where name = 'project_url'
    ) || '/functions/v1/coletar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
         where name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
