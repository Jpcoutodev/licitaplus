-- Licitaplus — chamados de suporte (erro, sugestão, reclamação, dúvida)
--
-- Cada usuário abre chamados e conversa por mensagens; vê status e respostas.
-- O admin (tabela `admins`) enxerga e administra todos os chamados. A autoria
-- de cada mensagem (quem escreveu e se é do suporte) é definida no servidor,
-- por trigger, para não depender do cliente — impede spoofing de "resposta do
-- suporte" por um usuário comum.

-- Helper reaproveitável: o chamador é admin? (lê `admins` apesar da RLS).
create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins a where a.email = (auth.jwt() ->> 'email')
  );
$$;

revoke execute on function public.eh_admin() from public;
grant execute on function public.eh_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.chamados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text,
  assunto text not null check (char_length(assunto) between 1 and 160),
  categoria text not null default 'duvida'
    check (categoria in ('erro', 'sugestao', 'reclamacao', 'duvida', 'outro')),
  status text not null default 'aberto'
    check (status in ('aberto', 'em_andamento', 'respondido', 'resolvido', 'fechado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chamados_user_idx on public.chamados (user_id);
create index chamados_status_idx on public.chamados (status);
create index chamados_updated_idx on public.chamados (updated_at desc);

create table public.chamado_mensagens (
  id uuid primary key default gen_random_uuid(),
  chamado_id uuid not null references public.chamados (id) on delete cascade,
  autor_id uuid references auth.users (id) on delete set null,
  autor_admin boolean not null default false,
  conteudo text not null check (char_length(conteudo) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index chamado_mensagens_idx
  on public.chamado_mensagens (chamado_id, created_at);

-- ---------------------------------------------------------------------------
-- Triggers de integridade e de fluxo de status
-- ---------------------------------------------------------------------------

-- Dono e email definidos no servidor (não confia no cliente).
create or replace function public.chamado_definir_dono()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.user_id := auth.uid();
  new.email := (auth.jwt() ->> 'email');
  return new;
end;
$$;

create trigger trg_chamado_dono
  before insert on public.chamados
  for each row execute function public.chamado_definir_dono();

-- Autoria definida no servidor: quem inseriu (auth.uid) e se é do suporte.
create or replace function public.chamado_msg_definir_autor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.autor_id := auth.uid();
  new.autor_admin := public.eh_admin();
  return new;
end;
$$;

create trigger trg_chamado_msg_autor
  before insert on public.chamado_mensagens
  for each row execute function public.chamado_msg_definir_autor();

-- Ao chegar mensagem: atualiza updated_at e move o status.
--  - resposta do suporte  -> 'respondido'
--  - resposta do usuário sobre um chamado já respondido/resolvido/fechado
--    -> 'aberto' (volta a pedir atenção)
create or replace function public.chamado_ao_receber_mensagem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chamados c
     set updated_at = now(),
         status = case
           when new.autor_admin then 'respondido'
           when c.status in ('respondido', 'resolvido', 'fechado') then 'aberto'
           else c.status
         end
   where c.id = new.chamado_id;
  return new;
end;
$$;

create trigger trg_chamado_msg_fluxo
  after insert on public.chamado_mensagens
  for each row execute function public.chamado_ao_receber_mensagem();

-- Mantém updated_at em edições diretas do chamado (ex.: admin muda status).
create or replace function public.chamado_toca_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_chamado_updated_at
  before update on public.chamados
  for each row execute function public.chamado_toca_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.chamados enable row level security;
alter table public.chamado_mensagens enable row level security;

-- Chamados: dono vê/edita o seu; admin vê/edita todos.
create policy chamados_ver on public.chamados
  for select to authenticated
  using (user_id = auth.uid() or public.eh_admin());

create policy chamados_criar on public.chamados
  for insert to authenticated
  with check (user_id = auth.uid());

create policy chamados_editar on public.chamados
  for update to authenticated
  using (user_id = auth.uid() or public.eh_admin())
  with check (user_id = auth.uid() or public.eh_admin());

-- Mensagens: visíveis a quem pode ver o chamado; inseríveis por dono ou admin.
-- (autor_id/autor_admin são forçados pelo trigger, não confiam no cliente.)
create policy chamado_msg_ver on public.chamado_mensagens
  for select to authenticated
  using (
    exists (
      select 1 from public.chamados c
      where c.id = chamado_id
        and (c.user_id = auth.uid() or public.eh_admin())
    )
  );

create policy chamado_msg_criar on public.chamado_mensagens
  for insert to authenticated
  with check (
    exists (
      select 1 from public.chamados c
      where c.id = chamado_id
        and (c.user_id = auth.uid() or public.eh_admin())
    )
  );
