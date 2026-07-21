-- SentinelaGov — Fase 1: Row Level Security
-- Princípio do menor privilégio:
--   perfis    → usuário só lê/escreve os próprios registros;
--   matches   → usuário só lê matches dos próprios perfis; escrita apenas via
--               service role (worker), que ignora RLS;
--   licitacoes→ dado compartilhado: leitura para autenticados, escrita apenas
--               via service role.
-- Nenhuma tabela fica sem RLS e nenhuma policy é "permitir tudo".

alter table public.perfis enable row level security;
alter table public.licitacoes enable row level security;
alter table public.matches enable row level security;

-- ---------------------------------------------------------------------------
-- perfis
-- ---------------------------------------------------------------------------
create policy perfis_select_proprio on public.perfis
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy perfis_insert_proprio on public.perfis
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy perfis_update_proprio on public.perfis
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy perfis_delete_proprio on public.perfis
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- licitacoes (sem policy de escrita: insert/update/delete só via service role)
-- ---------------------------------------------------------------------------
create policy licitacoes_select_autenticado on public.licitacoes
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- matches (sem policy de escrita: insert/update só via service role)
-- ---------------------------------------------------------------------------
create policy matches_select_proprio on public.matches
  for select to authenticated
  using (
    exists (
      select 1
      from public.perfis p
      where p.id = matches.perfil_id
        and p.user_id = (select auth.uid())
    )
  );
