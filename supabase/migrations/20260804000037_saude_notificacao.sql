-- SentinelaGov — saúde da notificação, para a aba Métricas
--
-- O sinal que importa é a fila: se `matches` com notificado_em nulo não zera
-- depois de cada rodada, o teto de perfis por execução apertou. É isso que
-- avisa antes de virar reclamação de cliente.
--
-- Junto vão os números que mostram se o custo está sob controle: licitações
-- coletadas por dia (que é o que dita o custo de IA, já que o resumo é por
-- licitação e não por usuário) e quanto do acervo já tem resumo em cache.

create or replace function public.saude_notificacao()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inicio_dia timestamptz :=
    date_trunc('day', now() at time zone 'America/Sao_Paulo')
      at time zone 'America/Sao_Paulo';
  v_resultado jsonb;
begin
  if not exists (
    select 1 from public.admins a where a.email = (auth.jwt() ->> 'email')
  ) then
    raise exception 'acesso restrito';
  end if;

  select jsonb_build_object(
    -- Fila
    'fila_pendente', (
      select count(*) from public.matches where notificado_em is null
    ),
    'fila_mais_antiga_horas', (
      select round(extract(epoch from (now() - min(created_at))) / 3600)
        from public.matches where notificado_em is null
    ),
    'fila_perfis_afetados', (
      select count(distinct perfil_id) from public.matches
       where notificado_em is null
    ),
    -- Última rodada
    'ultima_rodada', (
      select max(notificado_em) from public.matches
    ),
    'notificados_ultima_rodada', (
      select count(*) from public.matches m
       where m.notificado_em = (select max(notificado_em) from public.matches)
    ),
    -- Volume
    'emails_hoje', (
      select count(distinct notificado_em) from public.matches
       where notificado_em >= v_inicio_dia
    ),
    'emails_7d', (
      select count(distinct notificado_em) from public.matches
       where notificado_em > now() - interval '7 days'
    ),
    'matches_dia', (
      select count(*) from public.matches
       where created_at > now() - interval '1 day'
    ),
    'licitacoes_dia', (
      select count(*) from public.licitacoes
       where created_at > now() - interval '1 day'
    ),
    -- Capacidade
    'perfis_ativos', (select count(*) from public.perfis where ativo),
    'push_assinaturas', (select count(*) from public.push_assinaturas),
    'usuarios', (select count(*) from auth.users),
    -- Custo de IA: resumo é por licitação, então o cache é a economia
    'resumos_cache', (
      select count(*) from public.licitacoes where resumo_ia is not null
    ),
    'licitacoes_total', (select count(*) from public.licitacoes),
    'banco_mb', round(pg_database_size(current_database()) / 1048576.0)
  ) into v_resultado;

  return v_resultado;
end;
$$;

revoke execute on function public.saude_notificacao() from public, anon;
grant execute on function public.saude_notificacao() to authenticated;
