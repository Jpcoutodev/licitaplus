-- Licitaplus — assinaturas de push (Web Push nativo, sem terceiros)
--
-- Cada aparelho que ativa o push gera uma assinatura (endpoint + chaves).
-- O envio (função notificar, service role) lê as assinaturas do usuário.
-- Preferência = existência da assinatura: ativar cria, desativar remove.

create table public.push_assinaturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_assinaturas_user_idx on public.push_assinaturas (user_id);

alter table public.push_assinaturas enable row level security;

create policy push_select_proprio on public.push_assinaturas
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy push_insert_proprio on public.push_assinaturas
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy push_delete_proprio on public.push_assinaturas
  for delete to authenticated
  using (user_id = (select auth.uid()));
