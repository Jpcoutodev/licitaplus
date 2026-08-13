-- SentinelaGov — papéis da equipe: admin e testador
--
-- Um testador precisa usar o sistema inteiro sem limites (é assim que ele acha
-- o bug antes do cliente) mas não deve ver os números do negócio, que moram
-- todos na aba Métricas: faturamento, funil de assinatura, telemetria da IA e
-- os leads de consultoria.
--
-- Em vez de uma tabela nova, `admins` ganha um papel — os dois níveis ficam num
-- só lugar e nada muda para quem já era admin (o papel padrão).
--
-- A fronteira fica em dois helpers:
--   eh_admin()  -> só papel 'admin'. Números do negócio, suporte, contas.
--   eh_equipe() -> admin ou testador. Ferramentas internas de operação.
--
-- Onde a checagem já era inline (`select 1 from admins where email = ...`) o
-- testador entra sem alteração nenhuma, e é justamente onde queremos: é o caso
-- de minha_assinatura() (estado 'admin' = sem limites de trial nem de análises),
-- de limite_perfis() (99 perfis) e das funções de leads_*. Ou seja, "sem
-- limites" e "leads" saem de graça; o que precisa mudar é o outro lado — as
-- funções da aba Métricas passam a chamar eh_admin(), que agora exclui o
-- testador.

-- ---------------------------------------------------------------------------
-- Papel na tabela da equipe
-- ---------------------------------------------------------------------------

alter table public.admins
  add column papel text not null default 'admin'
    check (papel in ('admin', 'testador'));

comment on column public.admins.papel is
  'admin = equipe com acesso total; testador = tudo menos a aba Métricas';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- eh_admin() muda de sentido: agora é "admin pleno". Todas as policies que já
-- a usam (chamados, contas, ia_eventos, assinatura_eventos, consultoria_leads)
-- ficam automaticamente fora do alcance do testador — inclusive o trigger que
-- marca uma mensagem como "Suporte SentinelaGov", que para o testador passa a
-- gravar autoria de usuário comum, como deve ser.
create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins a
     where a.email = (auth.jwt() ->> 'email')
       and a.papel = 'admin'
  );
$$;

revoke execute on function public.eh_admin() from public, anon;
grant execute on function public.eh_admin() to authenticated;

-- eh_equipe(): está na tabela, qualquer papel. É o portão das ferramentas
-- internas de operação que o testador precisa exercitar.
create or replace function public.eh_equipe()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins a where a.email = (auth.jwt() ->> 'email')
  );
$$;

revoke execute on function public.eh_equipe() from public, anon;
grant execute on function public.eh_equipe() to authenticated;

-- ---------------------------------------------------------------------------
-- Leads (prospecção): equipe, não só admin
--
-- As funções leads_listar/leads_atualizar/leads_resumo/leads_enriquecer/
-- leads_dashboard já checam a tabela inline, então continuam valendo para o
-- testador. Aqui só as policies das tabelas, que usavam eh_admin().
-- ---------------------------------------------------------------------------

drop policy leads_contratos_admin_ver on public.leads_contratos;
create policy leads_contratos_equipe_ver on public.leads_contratos
  for select to authenticated
  using (public.eh_equipe());

drop policy leads_empresas_admin_ver on public.leads_empresas;
create policy leads_empresas_equipe_ver on public.leads_empresas
  for select to authenticated
  using (public.eh_equipe());

drop policy leads_empresas_admin_editar on public.leads_empresas;
create policy leads_empresas_equipe_editar on public.leads_empresas
  for update to authenticated
  using (public.eh_equipe())
  with check (public.eh_equipe());

-- ---------------------------------------------------------------------------
-- Métricas: as quatro funções da aba trocam a checagem inline por eh_admin()
--
-- Só o guarda mudou; o corpo é o mesmo das migrações originais (16, 31 e 37).
-- ---------------------------------------------------------------------------

create or replace function public.resumo_paginas()
returns table (
  caminho text,
  visualizacoes bigint,
  conversoes bigint,
  taxa_conversao numeric
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_admin() then
    raise exception 'acesso restrito';
  end if;

  return query
    select
      p.caminho,
      count(*) filter (where p.tipo = 'visualizacao') as visualizacoes,
      count(*) filter (where p.tipo = 'conversao') as conversoes,
      round(
        count(*) filter (where p.tipo = 'conversao')::numeric
        / nullif(count(*) filter (where p.tipo = 'visualizacao'), 0) * 100,
        1
      ) as taxa_conversao
    from public.pagina_eventos p
    group by p.caminho
    order by count(*) filter (where p.tipo = 'visualizacao') desc;
end;
$$;

revoke execute on function public.resumo_paginas() from public, anon;
grant execute on function public.resumo_paginas() to authenticated;

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
  if not public.eh_admin() then
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

create or replace function public.funil_assinatura(dias integer default 30)
returns table (
  evento text,
  total bigint,
  usuarios bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_admin() then
    raise exception 'acesso restrito';
  end if;

  return query
    select e.evento,
           count(*)::bigint as total,
           count(distinct e.user_id)::bigint as usuarios
      from public.assinatura_eventos e
     where e.created_at > now() - make_interval(days => dias)
     group by e.evento
     order by count(*) desc;
end;
$$;

revoke execute on function public.funil_assinatura(integer) from public, anon;
grant execute on function public.funil_assinatura(integer) to authenticated;

create or replace function public.eventos_assinatura_recentes(
  limite integer default 40
)
returns table (
  id uuid,
  evento text,
  email text,
  empresa text,
  plano text,
  detalhe text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_admin() then
    raise exception 'acesso restrito';
  end if;

  return query
    select e.id,
           e.evento,
           u.email::text,
           c.nome_empresa,
           e.plano,
           e.detalhe,
           e.created_at
      from public.assinatura_eventos e
      left join auth.users u on u.id = e.user_id
      left join public.contas c on c.user_id = e.user_id
     order by e.created_at desc
     limit least(greatest(limite, 1), 200);
end;
$$;

revoke execute on function public.eventos_assinatura_recentes(integer)
  from public, anon;
grant execute on function public.eventos_assinatura_recentes(integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- minha_assinatura(): continua 'admin' (= sem limites), mas diz qual papel
--
-- O estado é o que libera o uso e não muda: quem está na tabela da equipe não
-- tem trial, nem vencimento, nem teto de análises. O que muda é o `plano`, que
-- para a equipe passa a ser o papel — só para a página de assinatura não
-- chamar o testador de "Administrador". Corpo idêntico ao da migração 25.
-- ---------------------------------------------------------------------------

create or replace function public.minha_assinatura()
returns table (
  estado text,            -- 'admin' | 'ativo' | 'trial' | 'expirado' | 'sem_conta'
  plano text,
  trial_fim timestamptz,
  ativo_ate timestamptz,
  analises_usadas integer,
  analises_limite integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_conta public.contas%rowtype;
  v_papel text;
  v_usadas integer;
  v_mes text := to_char(now(), 'YYYY-MM');
begin
  select a.papel into v_papel
    from public.admins a
   where a.email = (auth.jwt() ->> 'email');

  select * into v_conta from public.contas where user_id = auth.uid();

  if v_papel is not null then
    return query select 'admin'::text, v_papel,
      null::timestamptz, null::timestamptz, 0, 999999;
    return;
  end if;

  if v_conta.user_id is null then
    return query select 'sem_conta'::text, 'trial'::text,
      null::timestamptz, null::timestamptz, 0, 10;
    return;
  end if;

  -- Plano pago vigente (limites: essencial 30/mês, profissional 100/mês —
  -- espelhados na edge function analise-ia).
  if v_conta.plano in ('essencial', 'profissional')
     and v_conta.plano_ativo_ate is not null
     and v_conta.plano_ativo_ate > now() then
    select coalesce(u.usadas, 0) into v_usadas
      from public.analises_uso u
     where u.user_id = auth.uid() and u.mes = v_mes;
    return query select 'ativo'::text, v_conta.plano,
      null::timestamptz, v_conta.plano_ativo_ate,
      coalesce(v_usadas, 0),
      case v_conta.plano when 'profissional' then 100 else 30 end;
    return;
  end if;

  -- Trial: 14 dias desde a criação da conta, 10 análises no total.
  if v_conta.created_at + interval '14 days' > now() then
    select coalesce(sum(u.usadas), 0)::integer into v_usadas
      from public.analises_uso u
     where u.user_id = auth.uid();
    return query select 'trial'::text, 'trial'::text,
      v_conta.created_at + interval '14 days', null::timestamptz,
      coalesce(v_usadas, 0), 10;
    return;
  end if;

  return query select 'expirado'::text, v_conta.plano,
    v_conta.created_at + interval '14 days', v_conta.plano_ativo_ate, 0, 0;
end;
$$;

revoke execute on function public.minha_assinatura() from public, anon;
grant execute on function public.minha_assinatura() to authenticated;

-- ---------------------------------------------------------------------------
-- Cadastro do testador
--
-- Para incluir (ou rebaixar um admin a testador), rode com o email da conta —
-- a mesma que ele usa para entrar no sistema:
--
--   insert into public.admins (email, papel)
--   values ('email-do-testador@exemplo.com', 'testador')
--   on conflict (email) do update set papel = 'testador';
--
-- Para revogar o acesso depois do teste:
--
--   delete from public.admins where email = 'email-do-testador@exemplo.com';
-- ---------------------------------------------------------------------------
