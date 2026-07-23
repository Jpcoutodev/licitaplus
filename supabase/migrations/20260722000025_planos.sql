-- SentinelaGov — planos e trial de verdade
--
-- Trial: 14 dias a partir da criação da conta, 1 perfil, 10 análises no total.
-- Pagos: Essencial (R$97, 30 análises/mês) e Profissional (R$197, 100/mês,
-- 3 perfis). CPF/CNPJ único no onboarding impede recriar conta para ganhar
-- outro trial. Admins não têm limites.

-- ---------------------------------------------------------------------------
-- contas: documento + estado do plano
-- ---------------------------------------------------------------------------

alter table public.contas
  add column cpf_cnpj text,
  add column plano text not null default 'trial'
    check (plano in ('trial', 'essencial', 'profissional')),
  add column plano_ativo_ate timestamptz,
  add column stripe_customer_id text,
  add column stripe_subscription_id text;

-- Só dígitos: 11 (CPF) ou 14 (CNPJ). Dígitos verificadores são validados no
-- app; aqui garantimos formato e unicidade (anti-burla de trial).
alter table public.contas
  add constraint contas_cpf_cnpj_formato
    check (cpf_cnpj is null or cpf_cnpj ~ '^\d{11}$|^\d{14}$');

create unique index contas_cpf_cnpj_unico
  on public.contas (cpf_cnpj)
  where cpf_cnpj is not null;

create index contas_stripe_sub_idx
  on public.contas (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- ---------------------------------------------------------------------------
-- analises_uso: contador de análises de IA (1 análise = 1 documento anexado)
-- ---------------------------------------------------------------------------

create table public.analises_uso (
  user_id uuid not null references auth.users (id) on delete cascade,
  mes text not null, -- 'YYYY-MM'
  usadas integer not null default 0,
  primary key (user_id, mes)
);

alter table public.analises_uso enable row level security;

-- Usuário vê o próprio uso; escrita apenas via service role (edge function).
create policy analises_uso_ver on public.analises_uso
  for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- minha_assinatura(): estado do plano para o app (fonte única no cliente)
-- ---------------------------------------------------------------------------

create or replace function public.minha_assinatura()
returns table (
  estado text,            -- 'admin' | 'ativo' | 'trial' | 'expirado' | 'sem_conta'
  plano text,
  trial_fim timestamptz,
  ativo_ate timestamptz,
  analises_usadas integer,
  analises_limite integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_conta public.contas%rowtype;
  v_admin boolean;
  v_usadas integer;
  v_mes text := to_char(now(), 'YYYY-MM');
begin
  select exists (
    select 1 from public.admins a where a.email = (auth.jwt() ->> 'email')
  ) into v_admin;

  select * into v_conta from public.contas where user_id = auth.uid();

  if v_admin then
    return query select 'admin'::text, coalesce(v_conta.plano, 'trial'),
      null::timestamptz, null::timestamptz, 0, 999999;
    return;
  end if;

  if v_conta.user_id is null then
    return query select 'sem_conta'::text, 'trial'::text,
      null::timestamptz, null::timestamptz, 0, 10;
    return;
  end if;

  -- Plano pago vigente (limites: essencial 30/mês, profissional 100/mês —
  -- espelhados na edge function analise-ia).
  if v_conta.plano in ('essencial', 'profissional')
     and v_conta.plano_ativo_ate is not null
     and v_conta.plano_ativo_ate > now() then
    select coalesce(u.usadas, 0) into v_usadas
      from public.analises_uso u
     where u.user_id = auth.uid() and u.mes = v_mes;
    return query select 'ativo'::text, v_conta.plano,
      null::timestamptz, v_conta.plano_ativo_ate,
      coalesce(v_usadas, 0),
      case v_conta.plano when 'profissional' then 100 else 30 end;
    return;
  end if;

  -- Trial: 14 dias desde a criação da conta, 10 análises no total.
  if v_conta.created_at + interval '14 days' > now() then
    select coalesce(sum(u.usadas), 0)::integer into v_usadas
      from public.analises_uso u
     where u.user_id = auth.uid();
    return query select 'trial'::text, 'trial'::text,
      v_conta.created_at + interval '14 days', null::timestamptz,
      coalesce(v_usadas, 0), 10;
    return;
  end if;

  return query select 'expirado'::text, v_conta.plano,
    v_conta.created_at + interval '14 days', v_conta.plano_ativo_ate, 0, 0;
end;
$$;

revoke execute on function public.minha_assinatura() from public;
grant execute on function public.minha_assinatura() to authenticated;
