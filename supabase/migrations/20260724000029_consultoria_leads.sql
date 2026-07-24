-- SentinelaGov — leads de consultoria (serviço "sob consulta")
--
-- Pedidos de contato para a consultoria (um especialista cuida de todas as
-- etapas da licitação). Gravados pela edge function `consultoria` (service
-- role); lidos e triados apenas por admins.

create table public.consultoria_leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 1 and 120),
  empresa text,
  telefone text not null,
  email text,
  mensagem text,
  atendido boolean not null default false,
  created_at timestamptz not null default now()
);

create index consultoria_leads_data_idx on public.consultoria_leads (created_at desc);

alter table public.consultoria_leads enable row level security;

-- Sem policy de insert: escrita apenas via service role (edge function).
create policy consultoria_admin_ver on public.consultoria_leads
  for select to authenticated
  using (public.eh_admin());

create policy consultoria_admin_editar on public.consultoria_leads
  for update to authenticated
  using (public.eh_admin())
  with check (public.eh_admin());
