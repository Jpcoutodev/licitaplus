-- SentinelaGov — backfill dos prazos de proposta que faltam
--
-- 1.346 das 6.963 licitações estão sem as datas de proposta (869 delas
-- aparecem no painel de alguém, via matches): são as que entraram pela busca
-- textual, que até agora descartava data_inicio_vigencia/data_fim_vigencia. A
-- coleta já foi corrigida, então licitação nova entra completa; isto aqui é
-- para o acervo que já está no banco.
--
-- Por que um job e não só sob demanda: `licitacoes` é dado compartilhado —
-- completar uma vez serve a todos os usuários que a virem, então não faz
-- sentido cada navegador buscar a mesma ficha.

-- ---------------------------------------------------------------------------
-- Marca de tentativa: sem isso o job insiste para sempre nas licitações em que
-- o PNCP realmente não publicou prazo.
-- ---------------------------------------------------------------------------

alter table public.licitacoes
  add column completar_tentado_em timestamptz;

comment on column public.licitacoes.completar_tentado_em is
  'Última tentativa de completar a ficha no PNCP (backfill de prazos)';

-- ---------------------------------------------------------------------------
-- Fila do backfill: incompletas, quem aparece em painel primeiro
-- ---------------------------------------------------------------------------

create or replace function public.licitacoes_para_completar(
  p_limite integer default 120
)
returns table (id uuid, numero_controle_pncp text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.numero_controle_pncp
    from public.licitacoes l
   where l.data_encerramento_proposta is null
     and (
       l.completar_tentado_em is null
       or l.completar_tentado_em < now() - interval '7 days'
     )
   order by
     -- Prioridade: o que já aparece no painel de alguém.
     exists (
       select 1 from public.matches m where m.licitacao_id = l.id
     ) desc,
     l.created_at desc
   limit least(greatest(p_limite, 1), 500);
$$;

-- Só o job (service role) enfileira; nenhum usuário precisa desta lista.
revoke execute on function public.licitacoes_para_completar(integer)
  from public, anon, authenticated;
grant execute on function public.licitacoes_para_completar(integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- Agendamento: a cada 5 minutos até a fila zerar
--
-- Com lotes de 120, as ~1.350 pendentes levam cerca de uma hora. Depois disso
-- o job praticamente não faz nada: a coleta corrigida já grava as datas, e a
-- marca de tentativa impede reprocessar o que o PNCP não informa. Mesmo padrão
-- da coleta: URL e service role key vêm do Vault.
-- ---------------------------------------------------------------------------

select cron.schedule(
  'sentinelagov-completar-pendentes',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets
       where name = 'project_url'
    ) || '/functions/v1/completar-pendentes',
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

-- Primeiro disparo agora, para não esperar o próximo minuto múltiplo de 5.
select net.http_post(
  url := (
    select decrypted_secret from vault.decrypted_secrets
     where name = 'project_url'
  ) || '/functions/v1/completar-pendentes',
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
