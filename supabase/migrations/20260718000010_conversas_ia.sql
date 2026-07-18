-- Licitaplus — memória do chat de análise com IA
--
-- Uma conversa por usuário × licitação (licitacao_id nulo = conversa geral,
-- sem licitação selecionada). O documento PDF anexado fica na conversa, para
-- não precisar reanexar. O frontend lê/grava direto (RLS restringe ao dono);
-- a IA continua recebendo apenas as últimas mensagens — o histórico completo
-- é para o usuário.

create table public.conversas_ia (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  licitacao_id uuid references public.licitacoes (id) on delete cascade,
  documento_nome text,
  documento_texto text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- nulls not distinct: uma única conversa "geral" (sem licitação) por usuário
  unique nulls not distinct (user_id, licitacao_id)
);

create trigger conversas_ia_updated_at
  before update on public.conversas_ia
  for each row execute function public.atualizar_updated_at();

create table public.mensagens_ia (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.conversas_ia (id) on delete cascade,
  ordem bigint generated always as identity,
  role text not null check (role in ('user', 'assistant')),
  conteudo text not null,
  created_at timestamptz not null default now()
);

create index mensagens_ia_conversa_idx on public.mensagens_ia (conversa_id, ordem);

alter table public.conversas_ia enable row level security;
alter table public.mensagens_ia enable row level security;

-- conversas: dono gerencia as próprias
create policy conversas_select_proprio on public.conversas_ia
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy conversas_insert_proprio on public.conversas_ia
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy conversas_update_proprio on public.conversas_ia
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy conversas_delete_proprio on public.conversas_ia
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- mensagens: acesso apenas via conversa do próprio usuário
create policy mensagens_select_proprio on public.mensagens_ia
  for select to authenticated
  using (
    exists (
      select 1 from public.conversas_ia c
      where c.id = mensagens_ia.conversa_id
        and c.user_id = (select auth.uid())
    )
  );

create policy mensagens_insert_proprio on public.mensagens_ia
  for insert to authenticated
  with check (
    exists (
      select 1 from public.conversas_ia c
      where c.id = mensagens_ia.conversa_id
        and c.user_id = (select auth.uid())
    )
  );

create policy mensagens_delete_proprio on public.mensagens_ia
  for delete to authenticated
  using (
    exists (
      select 1 from public.conversas_ia c
      where c.id = mensagens_ia.conversa_id
        and c.user_id = (select auth.uid())
    )
  );
