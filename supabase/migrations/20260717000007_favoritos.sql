-- Licitaplus — favoritos: licitações marcadas pelo usuário
-- (usadas também como contexto do chat de análise com IA)

create table public.favoritos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  licitacao_id uuid not null references public.licitacoes (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, licitacao_id)
);

create index favoritos_user_id_idx on public.favoritos (user_id);
create index favoritos_licitacao_id_idx on public.favoritos (licitacao_id);

alter table public.favoritos enable row level security;

create policy favoritos_select_proprio on public.favoritos
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy favoritos_insert_proprio on public.favoritos
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy favoritos_delete_proprio on public.favoritos
  for delete to authenticated
  using (user_id = (select auth.uid()));
