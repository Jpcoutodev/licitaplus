-- SentinelaGov — fila justa na seleção de perfis a notificar
--
-- A versão anterior fazia `order by p.id limit 40`. Ordem estável e
-- determinística: com mais de 40 perfis elegíveis numa rodada, os mesmos
-- seriam escolhidos sempre e os de id maior nunca receberiam nada. Passa
-- despercebido com 4 perfis e vira falha grave com 100.
--
-- Agora a ordem é por quem esperou mais: perfil sem notificação nenhuma vem
-- primeiro, depois os que receberam há mais tempo.

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
     -- Quem esperou mais vai primeiro; nunca notificado vem antes de todos.
     order by (
       select max(m3.notificado_em) from public.matches m3
        where m3.perfil_id = p.id
     ) asc nulls first
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
