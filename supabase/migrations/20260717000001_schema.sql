-- Licitaplus — Fase 1: schema inicial
-- Tabelas: perfis (dados do usuário), licitacoes (dado público compartilhado), matches (relação perfil x licitação).

-- ---------------------------------------------------------------------------
-- perfis: perfil de monitoramento de cada usuário
-- ---------------------------------------------------------------------------
create table public.perfis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  palavras_chave text[] not null,
  ufs text[] not null,
  modalidades int[] not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index perfis_user_id_idx on public.perfis (user_id);

create or replace function public.atualizar_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger perfis_updated_at
  before update on public.perfis
  for each row execute function public.atualizar_updated_at();

-- ---------------------------------------------------------------------------
-- licitacoes: contratações coletadas do PNCP (dado compartilhado entre usuários)
-- numero_controle_pncp é a chave de deduplicação/idempotência da coleta.
-- raw_json guarda o retorno completo do PNCP para reprocessamento futuro.
-- ---------------------------------------------------------------------------
create table public.licitacoes (
  id uuid primary key default gen_random_uuid(),
  numero_controle_pncp text not null unique,
  objeto_compra text not null,
  informacao_complementar text,
  valor_total_estimado numeric,
  data_abertura_proposta timestamptz,
  data_encerramento_proposta timestamptz,
  orgao_cnpj text,
  orgao_razao_social text,
  unidade_nome text,
  uf char(2),
  municipio_nome text,
  modalidade_id int,
  modalidade_nome text,
  situacao_nome text,
  link_sistema_origem text,
  raw_json jsonb not null,
  objeto_tsv tsvector generated always as (
    to_tsvector(
      'portuguese',
      coalesce(objeto_compra, '') || ' ' || coalesce(informacao_complementar, '')
    )
  ) stored,
  created_at timestamptz not null default now()
);

create index licitacoes_objeto_tsv_idx on public.licitacoes using gin (objeto_tsv);
create index licitacoes_uf_idx on public.licitacoes (uf);
create index licitacoes_data_encerramento_idx on public.licitacoes (data_encerramento_proposta);

-- ---------------------------------------------------------------------------
-- matches: licitação compatível com um perfil
-- unique (perfil_id, licitacao_id) garante idempotência do matching;
-- notificado_em nulo = email ainda não enviado (idempotência da notificação).
-- ---------------------------------------------------------------------------
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  licitacao_id uuid not null references public.licitacoes (id) on delete cascade,
  notificado_em timestamptz,
  created_at timestamptz not null default now(),
  unique (perfil_id, licitacao_id)
);

create index matches_licitacao_id_idx on public.matches (licitacao_id);
create index matches_nao_notificados_idx on public.matches (notificado_em)
  where notificado_em is null;
