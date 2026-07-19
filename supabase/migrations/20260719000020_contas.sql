-- Licitaplus — dados de conta da empresa (onboarding pós-cadastro)
--
-- Guarda nome da empresa e telefone, coletados logo após o cadastro. Uma linha
-- por usuário. Admin pode ler (para exibir junto aos chamados, por exemplo).

create table public.contas (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nome_empresa text not null check (char_length(nome_empresa) between 1 and 160),
  telefone text not null check (char_length(telefone) between 8 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contas enable row level security;

create policy contas_ver on public.contas
  for select to authenticated
  using (user_id = auth.uid() or public.eh_admin());

create policy contas_criar on public.contas
  for insert to authenticated
  with check (user_id = auth.uid());

create policy contas_editar on public.contas
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger contas_updated_at
  before update on public.contas
  for each row execute function public.atualizar_updated_at();
