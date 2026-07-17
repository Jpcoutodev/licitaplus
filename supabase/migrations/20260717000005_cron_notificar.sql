-- Licitaplus — Fase 4: agendamento da notificação por email
-- Roda com 15 minutos de offset em relação à coleta (que roda em :00 e :30),
-- usando os mesmos segredos do Vault (project_url, service_role_key).

select cron.schedule(
  'licitaplus-notificar',
  '15,45 * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets
       where name = 'project_url'
    ) || '/functions/v1/notificar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
         where name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
