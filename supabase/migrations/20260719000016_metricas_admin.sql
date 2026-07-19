-- Licitaplus — painel de métricas restrito a administradores
--
-- As métricas de página (marketing) não são dados de usuário, mas também não
-- devem ficar visíveis a clientes. Uma tabela `admins` define quem pode ver,
-- e resumo_paginas() passa a exigir que o chamador seja admin.

create table public.admins (
  email text primary key,
  criado_em timestamptz not null default now()
);

alter table public.admins enable row level security;

-- Cada usuário só enxerga a própria linha (para o app saber se ELE é admin).
create policy admins_ve_proprio on public.admins
  for select to authenticated
  using (email = (auth.jwt() ->> 'email'));

-- Semente: o dono do projeto.
insert into public.admins (email) values ('coutodev7@gmail.com')
  on conflict do nothing;

-- Recria o resumo com verificação de admin embutida (SECURITY DEFINER lê a
-- tabela apesar da RLS). create or replace reabre o EXECUTE ao PUBLIC, então
-- re-restringimos logo abaixo.
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
  if not exists (
    select 1 from public.admins a where a.email = (auth.jwt() ->> 'email')
  ) then
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

revoke execute on function public.resumo_paginas() from public;
grant execute on function public.resumo_paginas() to authenticated;
