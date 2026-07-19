-- Licitaplus — monitoramento de páginas (blog e marketing)
--
-- Mede visualizações e conversões (clique no CTA de teste) por caminho.
-- O blog é público e sem login, então o registro vem do visitante anônimo:
-- RLS permite INSERT validado por anon, mas NÃO permite leitura (relatórios
-- só via service role / função de resumo).

create table public.pagina_eventos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('visualizacao', 'conversao')),
  caminho text not null,
  sessao text,
  referer text,
  created_at timestamptz not null default now()
);

create index pagina_eventos_relatorio_idx
  on public.pagina_eventos (caminho, tipo, created_at);

alter table public.pagina_eventos enable row level security;

-- Visitante anônimo pode registrar eventos, com validação de forma (evita
-- lixo): tipo válido, caminho começando com "/" e tamanhos limitados.
create policy pagina_eventos_insert_publico on public.pagina_eventos
  for insert to anon, authenticated
  with check (
    tipo in ('visualizacao', 'conversao')
    and caminho ~ '^/'
    and length(caminho) <= 300
    and (sessao is null or length(sessao) <= 64)
    and (referer is null or length(referer) <= 500)
  );

-- Sem policy de SELECT: leitura apenas via service role.

-- Resumo agregado por caminho (views, conversões e taxa). SECURITY DEFINER
-- para uso futuro num painel de admin; execução negada ao público.
create or replace function public.resumo_paginas()
returns table (
  caminho text,
  visualizacoes bigint,
  conversoes bigint,
  taxa_conversao numeric
)
language sql
security definer
set search_path = ''
as $$
  select
    caminho,
    count(*) filter (where tipo = 'visualizacao') as visualizacoes,
    count(*) filter (where tipo = 'conversao') as conversoes,
    round(
      count(*) filter (where tipo = 'conversao')::numeric
      / nullif(count(*) filter (where tipo = 'visualizacao'), 0) * 100,
      1
    ) as taxa_conversao
  from public.pagina_eventos
  group by caminho
  order by visualizacoes desc;
$$;

revoke execute on function public.resumo_paginas() from public;
revoke execute on function public.resumo_paginas() from anon;
revoke execute on function public.resumo_paginas() from authenticated;
