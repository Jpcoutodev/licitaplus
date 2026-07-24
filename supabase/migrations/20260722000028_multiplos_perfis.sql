-- SentinelaGov — múltiplos perfis de busca (recurso do plano Profissional)
--
-- Cada perfil ganha um nome (rótulo) e a quantidade é travada por plano no
-- servidor: trial/Essencial = 1, Profissional vigente = 3, admin = sem teto.
-- O backend (coleta/matching/notificação) sempre foi multi-perfil; a trava e
-- a UI eram o que faltava.

alter table public.perfis
  add column nome text not null default 'Meu perfil'
    check (char_length(nome) between 1 and 60);

-- Limite de perfis do usuário conforme o plano (espelha minha_assinatura()).
create or replace function public.limite_perfis(p_user uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_conta public.contas%rowtype;
  v_admin boolean;
begin
  select exists (
    select 1
    from public.admins a
    join auth.users u on u.email = a.email
    where u.id = p_user
  ) into v_admin;
  if v_admin then
    return 99;
  end if;

  select * into v_conta from public.contas where user_id = p_user;
  if v_conta.user_id is not null
     and v_conta.plano = 'profissional'
     and v_conta.plano_ativo_ate is not null
     and v_conta.plano_ativo_ate > now() then
    return 3;
  end if;
  return 1;
end;
$$;

revoke execute on function public.limite_perfis(uuid) from public;
grant execute on function public.limite_perfis(uuid) to authenticated;

-- Trava no servidor: o cliente não cria perfis além do plano.
create or replace function public.perfis_checar_limite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.perfis p where p.user_id = new.user_id)
     >= public.limite_perfis(new.user_id) then
    raise exception 'limite de perfis do plano atingido';
  end if;
  return new;
end;
$$;

create trigger trg_perfis_limite
  before insert on public.perfis
  for each row execute function public.perfis_checar_limite();
