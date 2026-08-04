-- SentinelaGov — notificação em lotes, pronta para escalar
--
-- O modelo anterior tratava cada match como um envio a ser feito, lia 30 por
-- execução no sistema inteiro e ordenava por data de chegada. Com 4 perfis já
-- criava 98 matches/dia contra 40 notificáveis: a fila crescia ~58/dia e, por
-- ser FIFO, o email falaria de licitações cada vez mais velhas — até avisar
-- sobre prazo já vencido, que é pior do que não avisar.
--
-- O modelo novo:
--
--   1. Resumo da IA fica na LICITAÇÃO, não no match. A mesma licitação casa
--      com dezenas de perfis; antes gerava um resumo por perfil. É a maior
--      economia da mudança.
--   2. Cada email é um LOTE que zera a fila do perfil: detalha os mais
--      urgentes e diz "+N no painel". Não sobra backlog permanente.
--   3. Ordem por PRAZO, não por chegada, descartando o que já encerrou.
--   4. Teto de emails por dia por usuário (padrão 3, ajustável para menos).
--   5. Uma query monta todos os lotes, em vez de ler tudo e agrupar no
--      código.

-- ---------------------------------------------------------------------------
-- Cache do resumo na licitação
-- ---------------------------------------------------------------------------

alter table public.licitacoes
  add column resumo_ia text,
  add column resumo_ia_em timestamptz;

comment on column public.licitacoes.resumo_ia is
  'Resumo gerado pela IA, reaproveitado por todos os perfis que casarem com esta licitação.';

-- ---------------------------------------------------------------------------
-- Teto de emails por dia, por usuário
-- ---------------------------------------------------------------------------

alter table public.contas
  add column max_emails_dia smallint not null default 3
    check (max_emails_dia between 1 and 3);

comment on column public.contas.max_emails_dia is
  'Quantos emails de alerta o usuário aceita por dia (1 a 3).';

-- Busca de pendentes por perfil: o índice parcial existente cobre
-- "notificado_em is null" globalmente, mas a consulta agora é sempre por
-- perfil.
create index matches_perfil_pendente_idx
  on public.matches (perfil_id)
  where notificado_em is null;

-- ---------------------------------------------------------------------------
-- lotes_para_notificar(): monta todos os lotes da rodada numa consulta só
--
-- Devolve, por perfil elegível: o email do dono, as licitações a detalhar
-- (as de prazo mais apertado) e quantas ficam de fora do detalhamento.
-- ---------------------------------------------------------------------------

create or replace function public.lotes_para_notificar(
  p_max_perfis integer default 40,
  p_detalhados integer default 8
)
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
  with elegiveis as (
    select p.id as perfil_id,
           p.user_id
      from public.perfis p
      join public.contas c on c.user_id = p.user_id
     where p.ativo
       -- Cada email do dia compartilha o mesmo notificado_em, então contar
       -- timestamps distintos conta emails — sem tabela de log.
       and (
         select count(distinct m.notificado_em)
           from public.matches m
          where m.perfil_id = p.id
            and m.notificado_em >= v_inicio_dia
       ) < c.max_emails_dia
       and exists (
         select 1
           from public.matches m2
           join public.licitacoes l2 on l2.id = m2.licitacao_id
          where m2.perfil_id = p.id
            and m2.notificado_em is null
            and (l2.data_encerramento_proposta is null
                 or l2.data_encerramento_proposta > now())
       )
     order by p.id
     limit p_max_perfis
  ),
  detalhados as (
    select e.perfil_id,
           jsonb_agg(
             jsonb_build_object(
               'match_id', d.match_id,
               'licitacao_id', d.licitacao_id,
               'numero_controle_pncp', d.numero_controle_pncp,
               'objeto_compra', d.objeto_compra,
               'informacao_complementar', d.informacao_complementar,
               'valor_total_estimado', d.valor_total_estimado,
               'data_abertura_proposta', d.data_abertura_proposta,
               'data_encerramento_proposta', d.data_encerramento_proposta,
               'orgao_razao_social', d.orgao_razao_social,
               'unidade_nome', d.unidade_nome,
               'uf', d.uf,
               'municipio_nome', d.municipio_nome,
               'modalidade_nome', d.modalidade_nome,
               'link_sistema_origem', d.link_sistema_origem,
               'resumo_ia', d.resumo_ia
             ) order by d.ordem
           ) as itens
      from elegiveis e
      cross join lateral (
        select m.id as match_id, l.id as licitacao_id,
               l.numero_controle_pncp, l.objeto_compra,
               l.informacao_complementar, l.valor_total_estimado,
               l.data_abertura_proposta, l.data_encerramento_proposta,
               l.orgao_razao_social, l.unidade_nome, l.uf, l.municipio_nome,
               l.modalidade_nome, l.link_sistema_origem, l.resumo_ia,
               row_number() over (
                 order by l.data_encerramento_proposta asc nulls last
               ) as ordem
          from public.matches m
          join public.licitacoes l on l.id = m.licitacao_id
         where m.perfil_id = e.perfil_id
           and m.notificado_em is null
           and (l.data_encerramento_proposta is null
                or l.data_encerramento_proposta > now())
         order by l.data_encerramento_proposta asc nulls last
         limit p_detalhados
      ) d
     group by e.perfil_id
  ),
  totais as (
    select e.perfil_id,
           count(*) filter (
             where l.data_encerramento_proposta is null
                or l.data_encerramento_proposta > now()
           ) as validos,
           count(*) as pendentes
      from elegiveis e
      join public.matches m on m.perfil_id = e.perfil_id
                           and m.notificado_em is null
      join public.licitacoes l on l.id = m.licitacao_id
     group by e.perfil_id
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'perfil_id', e.perfil_id,
             'user_id', e.user_id,
             'email', u.email,
             'itens', d.itens,
             'validos', t.validos,
             'pendentes', t.pendentes
           )
         ), '[]'::jsonb)
    into v_resultado
    from elegiveis e
    join detalhados d on d.perfil_id = e.perfil_id
    join totais t on t.perfil_id = e.perfil_id
    join auth.users u on u.id = e.user_id
   where u.email is not null;

  return v_resultado;
end;
$$;

revoke execute on function public.lotes_para_notificar(integer, integer)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- fechar_lote_notificado(): marca TODOS os pendentes do perfil
--
-- Inclusive os que já encerraram e os que não couberam no detalhamento (o
-- email diz "+N no painel"). É isso que impede a fila de crescer para sempre:
-- notificado_em passa a significar "já passou pelo ciclo de notificação".
-- ---------------------------------------------------------------------------

create or replace function public.fechar_lote_notificado(
  p_perfil_id uuid,
  p_em timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qtd integer;
begin
  update public.matches
     set notificado_em = p_em
   where perfil_id = p_perfil_id
     and notificado_em is null;
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

revoke execute on function public.fechar_lote_notificado(uuid, timestamptz)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- guardar_resumo_ia(): grava o resumo na licitação para reuso
-- ---------------------------------------------------------------------------

create or replace function public.guardar_resumo_ia(
  p_licitacao_id uuid,
  p_resumo text
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.licitacoes
     set resumo_ia = p_resumo, resumo_ia_em = now()
   where id = p_licitacao_id;
$$;

revoke execute on function public.guardar_resumo_ia(uuid, text)
  from public, anon, authenticated;
