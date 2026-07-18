-- Licitaplus — coleta/notificação a cada 2h, das 7h às 19h (Brasília)
--
-- Licitações têm prazo em dias/semanas e são publicadas em horário comercial;
-- rodar de madrugada só desperdiça chamadas ao PNCP. O pg_cron agenda em UTC;
-- Brasília é UTC-3 fixo (sem horário de verão), então 7h–19h BRT = 10h–22h UTC.
-- Coleta nas horas pares do intervalo; notificação 15 min depois de cada uma.

select cron.alter_job(
  (select jobid from cron.job where jobname = 'licitaplus-coletar'),
  schedule := '0 10-22/2 * * *'
);

select cron.alter_job(
  (select jobid from cron.job where jobname = 'licitaplus-notificar'),
  schedule := '15 10-22/2 * * *'
);
