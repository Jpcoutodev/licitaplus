-- SentinelaGov — prospecção de leads (ferramenta interna, só admin)
--
-- Nada aqui pertence ao produto do cliente: são empresas que JÁ venceram
-- contratos públicos, garimpadas no PNCP para a equipe abordar e oferecer o
-- teste grátis. Tabelas isoladas de perfis/licitacoes/matches, sem qualquer
-- chave estrangeira para o mundo do cliente.
--
-- Privacidade: contrato público é dado aberto. Já email, telefone e nome do
-- responsável são preenchidos à mão pela equipe e são dado pessoal — ficam
-- restritos a admin e existem para contato comercial, nada além disso.

-- ---------------------------------------------------------------------------
-- leads_contratos: o dado bruto, um registro por contrato
-- ---------------------------------------------------------------------------

create table public.leads_contratos (
  numero_controle_pncp text primary key,
  ni_fornecedor text not null,
  nome_fornecedor text not null,
  tipo_pessoa text,
  cnpj_orgao text,
  orgao_nome text,
  uf text,
  municipio text,
  objeto_contrato text,
  valor_global numeric,
  data_publicacao timestamptz,
  raw_json jsonb,
  created_at timestamptz not null default now()
);

create index leads_contratos_fornecedor_idx
  on public.leads_contratos (ni_fornecedor);
create index leads_contratos_data_idx
  on public.leads_contratos (data_publicacao desc);

-- ---------------------------------------------------------------------------
-- leads_empresas: a visão agregada — é o que a página lista
-- ---------------------------------------------------------------------------

create table public.leads_empresas (
  ni_fornecedor text primary key,
  nome_fornecedor text not null,
  -- raiz do CNPJ (8 primeiros dígitos): filiais da mesma empresa compartilham.
  -- Guardada para agrupar na tela sem perder o CNPJ exato de cada unidade.
  raiz_cnpj text generated always as (left(ni_fornecedor, 8)) stored,

  qtd_contratos integer not null default 0,
  valor_total_acumulado numeric not null default 0,
  data_ultimo_contrato timestamptz,
  ufs text[] not null default '{}',
  qtd_orgaos integer not null default 0,
  objeto_ultimo_contrato text,

  status_prospeccao text not null default 'novo'
    check (status_prospeccao in (
      'novo', 'contatado', 'respondeu', 'testando', 'cliente', 'descartado'
    )),
  notas text,
  contato_email text,
  contato_telefone text,
  contato_responsavel text,
  -- Follow-up: sem isso um lead contatado some no meio da lista.
  ultimo_contato_em date,
  proximo_contato_em date,

  created_at timestamptz not null default now(),
  -- nome em inglês para reusar o trigger atualizar_updated_at já existente
  updated_at timestamptz not null default now()
);

create index leads_empresas_status_idx
  on public.leads_empresas (status_prospeccao, data_ultimo_contrato desc);
create index leads_empresas_valor_idx
  on public.leads_empresas (valor_total_acumulado desc);
create index leads_empresas_followup_idx
  on public.leads_empresas (proximo_contato_em)
  where proximo_contato_em is not null;
create index leads_empresas_nome_idx
  on public.leads_empresas using gin (to_tsvector('portuguese', nome_fornecedor));

create trigger leads_empresas_atualizado
  before update on public.leads_empresas
  for each row execute function public.atualizar_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: admin lê e edita a gestão; a coleta escreve via service role
-- ---------------------------------------------------------------------------

alter table public.leads_contratos enable row level security;
alter table public.leads_empresas enable row level security;

-- Sem policy de escrita em leads_contratos: só a coleta (service role) grava.
create policy leads_contratos_admin_ver on public.leads_contratos
  for select to authenticated
  using (public.eh_admin());

create policy leads_empresas_admin_ver on public.leads_empresas
  for select to authenticated
  using (public.eh_admin());

-- Admin edita apenas a camada de gestão comercial. A coleta continua sendo a
-- única fonte dos números agregados — por isso o UPDATE do admin passa pela
-- função abaixo, e não por escrita direta em colunas quaisquer.
create policy leads_empresas_admin_editar on public.leads_empresas
  for update to authenticated
  using (public.eh_admin())
  with check (public.eh_admin());

-- ---------------------------------------------------------------------------
-- leads_listar(): a consulta da página, com filtros
-- ---------------------------------------------------------------------------

create or replace function public.leads_listar(
  p_busca text default null,
  p_uf text default null,
  p_status text default null,
  p_dias integer default null,        -- último contrato nos últimos N dias
  p_valor_minimo numeric default null,
  p_so_followup boolean default false, -- só quem tem retorno vencido/hoje
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
  proximo_contato_em date
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
                else 0 end as ticket_medio,
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
           e.proximo_contato_em
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
       and (not p_so_followup
            or (e.proximo_contato_em is not null
                and e.proximo_contato_em <= current_date))
     order by e.valor_total_acumulado desc
     limit least(greatest(p_limite, 1), 1000);
end;
$$;

revoke execute on function public.leads_listar(
  text, text, text, integer, numeric, boolean, integer) from public, anon;
grant execute on function public.leads_listar(
  text, text, text, integer, numeric, boolean, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- leads_atualizar(): a edição comercial, campo a campo e só o que é permitido
-- ---------------------------------------------------------------------------

create or replace function public.leads_atualizar(
  p_ni text,
  p_status text default null,
  p_notas text default null,
  p_email text default null,
  p_telefone text default null,
  p_responsavel text default null,
  p_proximo_contato date default null,
  p_marcar_contato_hoje boolean default false
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
         ultimo_contato_em   = case when p_marcar_contato_hoje
                                    then current_date
                                    else e.ultimo_contato_em end
   where e.ni_fornecedor = p_ni;
end;
$$;

revoke execute on function public.leads_atualizar(
  text, text, text, text, text, text, date, boolean) from public, anon;
grant execute on function public.leads_atualizar(
  text, text, text, text, text, text, date, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- leads_resumo(): contadores por status, para o topo da página
-- ---------------------------------------------------------------------------

create or replace function public.leads_resumo()
returns table (status text, total bigint)
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
    select e.status_prospeccao, count(*)::bigint
      from public.leads_empresas e
     group by e.status_prospeccao;
end;
$$;

revoke execute on function public.leads_resumo() from public, anon;
grant execute on function public.leads_resumo() to authenticated;
