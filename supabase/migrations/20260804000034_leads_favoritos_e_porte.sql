-- SentinelaGov — leads: favoritos, dados do registro público e novos filtros
--
-- Três acréscimos à ferramenta de prospecção:
--
-- 1. favorito: separar quem vale a pena trabalhar agora do resto da lista.
-- 2. dados do CNPJ na Receita (porte, abertura, situação, CNAE) preenchidos a
--    partir do registro público — é o que identifica "empresa que está
--    começando" com precisão, melhor do que deduzir pelo valor do contrato.
-- 3. filtro de valor MÁXIMO, para achar contratos pequenos.
--
-- Sobre a origem dos contatos: vêm do cadastro público de CNPJ da Receita
-- Federal (telefone e email que a própria empresa declarou), não de varredura
-- da internet. É dado comercial declarado, não coletado de terceiros.

alter table public.leads_empresas
  add column favorito boolean not null default false,
  add column porte text,
  add column situacao_cadastral text,
  add column data_abertura date,
  add column capital_social numeric,
  add column cnae text,
  add column municipio text,
  add column enriquecido_em timestamptz;

create index leads_empresas_favorito_idx
  on public.leads_empresas (favorito)
  where favorito;

-- ---------------------------------------------------------------------------
-- leads_listar(): filtros de valor máximo, porte e favoritos
-- O tipo de retorno muda, então recria em vez de substituir.
-- ---------------------------------------------------------------------------

drop function if exists public.leads_listar(
  text, text, text, integer, numeric, boolean, integer);

create function public.leads_listar(
  p_busca text default null,
  p_uf text default null,
  p_status text default null,
  p_dias integer default null,
  p_valor_minimo numeric default null,
  p_valor_maximo numeric default null,
  p_porte text default null,
  p_so_followup boolean default false,
  p_so_favoritos boolean default false,
  p_limite integer default 200
)
returns table (
  ni_fornecedor text,
  nome_fornecedor text,
  qtd_contratos integer,
  valor_total_acumulado numeric,
  ticket_medio numeric,
  data_ultimo_contrato timestamptz,
  ufs text[],
  qtd_orgaos integer,
  objeto_ultimo_contrato text,
  status_prospeccao text,
  notas text,
  contato_email text,
  contato_telefone text,
  contato_responsavel text,
  ultimo_contato_em date,
  proximo_contato_em date,
  favorito boolean,
  porte text,
  situacao_cadastral text,
  data_abertura date,
  cnae text,
  municipio text,
  enriquecido_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.admins a where a.email = (auth.jwt() ->> 'email')
  ) then
    raise exception 'acesso restrito';
  end if;

  return query
    select e.ni_fornecedor,
           e.nome_fornecedor,
           e.qtd_contratos,
           e.valor_total_acumulado,
           case when e.qtd_contratos > 0
                then round(e.valor_total_acumulado / e.qtd_contratos, 2)
                else 0 end,
           e.data_ultimo_contrato,
           e.ufs,
           e.qtd_orgaos,
           e.objeto_ultimo_contrato,
           e.status_prospeccao,
           e.notas,
           e.contato_email,
           e.contato_telefone,
           e.contato_responsavel,
           e.ultimo_contato_em,
           e.proximo_contato_em,
           e.favorito,
           e.porte,
           e.situacao_cadastral,
           e.data_abertura,
           e.cnae,
           e.municipio,
           e.enriquecido_em
      from public.leads_empresas e
     where (p_busca is null or p_busca = ''
            or e.nome_fornecedor ilike '%' || p_busca || '%'
            or e.ni_fornecedor like p_busca || '%'
            or e.objeto_ultimo_contrato ilike '%' || p_busca || '%')
       and (p_uf is null or p_uf = '' or p_uf = any (e.ufs))
       and (p_status is null or p_status = ''
            or e.status_prospeccao = p_status)
       and (p_dias is null
            or e.data_ultimo_contrato > now() - make_interval(days => p_dias))
       and (p_valor_minimo is null
            or e.valor_total_acumulado >= p_valor_minimo)
       and (p_valor_maximo is null
            or e.valor_total_acumulado <= p_valor_maximo)
       and (p_porte is null or p_porte = '' or e.porte = p_porte)
       and (not p_so_followup
            or (e.proximo_contato_em is not null
                and e.proximo_contato_em <= current_date))
       and (not p_so_favoritos or e.favorito)
     order by e.favorito desc, e.valor_total_acumulado desc
     limit least(greatest(p_limite, 1), 1000);
end;
$$;

revoke execute on function public.leads_listar(
  text, text, text, integer, numeric, numeric, text, boolean, boolean, integer)
  from public, anon;
grant execute on function public.leads_listar(
  text, text, text, integer, numeric, numeric, text, boolean, boolean, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- leads_atualizar(): agora também marca favorito
-- ---------------------------------------------------------------------------

drop function if exists public.leads_atualizar(
  text, text, text, text, text, text, date, boolean);

create function public.leads_atualizar(
  p_ni text,
  p_status text default null,
  p_notas text default null,
  p_email text default null,
  p_telefone text default null,
  p_responsavel text default null,
  p_proximo_contato date default null,
  p_marcar_contato_hoje boolean default false,
  p_favorito boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.admins a where a.email = (auth.jwt() ->> 'email')
  ) then
    raise exception 'acesso restrito';
  end if;

  update public.leads_empresas e
     set status_prospeccao = coalesce(p_status, e.status_prospeccao),
         notas             = coalesce(p_notas, e.notas),
         contato_email     = coalesce(p_email, e.contato_email),
         contato_telefone  = coalesce(p_telefone, e.contato_telefone),
         contato_responsavel = coalesce(p_responsavel, e.contato_responsavel),
         proximo_contato_em  = coalesce(p_proximo_contato, e.proximo_contato_em),
         favorito            = coalesce(p_favorito, e.favorito),
         ultimo_contato_em   = case when p_marcar_contato_hoje
                                    then current_date
                                    else e.ultimo_contato_em end
   where e.ni_fornecedor = p_ni;
end;
$$;

revoke execute on function public.leads_atualizar(
  text, text, text, text, text, text, date, boolean, boolean)
  from public, anon;
grant execute on function public.leads_atualizar(
  text, text, text, text, text, text, date, boolean, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- leads_enriquecer(): grava o que veio do cadastro público de CNPJ
--
-- Contato só é sobrescrito quando ainda está vazio: o que a equipe apurou na
-- conversa vale mais que o telefone do cadastro, e não pode ser perdido por
-- um clique em "buscar contato".
-- ---------------------------------------------------------------------------

create or replace function public.leads_enriquecer(
  p_ni text,
  p_email text default null,
  p_telefone text default null,
  p_porte text default null,
  p_situacao text default null,
  p_abertura date default null,
  p_capital numeric default null,
  p_cnae text default null,
  p_municipio text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.admins a where a.email = (auth.jwt() ->> 'email')
  ) then
    raise exception 'acesso restrito';
  end if;

  update public.leads_empresas e
     set contato_email = coalesce(nullif(e.contato_email, ''), p_email),
         contato_telefone = coalesce(nullif(e.contato_telefone, ''), p_telefone),
         porte = coalesce(p_porte, e.porte),
         situacao_cadastral = coalesce(p_situacao, e.situacao_cadastral),
         data_abertura = coalesce(p_abertura, e.data_abertura),
         capital_social = coalesce(p_capital, e.capital_social),
         cnae = coalesce(p_cnae, e.cnae),
         municipio = coalesce(p_municipio, e.municipio),
         enriquecido_em = now()
   where e.ni_fornecedor = p_ni;
end;
$$;

revoke execute on function public.leads_enriquecer(
  text, text, text, text, text, date, numeric, text, text) from public, anon;
grant execute on function public.leads_enriquecer(
  text, text, text, text, text, date, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- leads_dashboard(): números do funil de prospecção
-- ---------------------------------------------------------------------------

create or replace function public.leads_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resultado jsonb;
begin
  if not exists (
    select 1 from public.admins a where a.email = (auth.jwt() ->> 'email')
  ) then
    raise exception 'acesso restrito';
  end if;

  select jsonb_build_object(
    'total', (select count(*) from public.leads_empresas),
    'favoritos', (select count(*) from public.leads_empresas where favorito),
    'com_contato', (select count(*) from public.leads_empresas
                     where coalesce(contato_email, contato_telefone) is not null),
    'followup_vencido', (select count(*) from public.leads_empresas
                          where proximo_contato_em is not null
                            and proximo_contato_em <= current_date),
    'contratos', (select count(*) from public.leads_contratos),
    'valor_total', (select coalesce(sum(valor_total_acumulado), 0)
                      from public.leads_empresas),
    'por_status', (
      select coalesce(jsonb_object_agg(s.status_prospeccao, s.n), '{}'::jsonb)
        from (select status_prospeccao, count(*) as n
                from public.leads_empresas group by status_prospeccao) s
    ),
    'por_porte', (
      select coalesce(jsonb_object_agg(p.porte, p.n), '{}'::jsonb)
        from (select coalesce(porte, 'não consultado') as porte, count(*) as n
                from public.leads_empresas group by 1) p
    ),
    'por_uf', (
      select coalesce(jsonb_object_agg(u.uf, u.n), '{}'::jsonb)
        from (select unnest(ufs) as uf, count(*) as n
                from public.leads_empresas group by 1
                order by 2 desc limit 10) u
    ),
    'novos_7d', (select count(*) from public.leads_empresas
                  where created_at > now() - interval '7 days')
  ) into resultado;

  return resultado;
end;
$$;

revoke execute on function public.leads_dashboard() from public, anon;
grant execute on function public.leads_dashboard() to authenticated;
