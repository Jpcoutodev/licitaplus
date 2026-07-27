-- SentinelaGov — funil de assinatura
--
-- Registra cada etapa da jornada de pagamento para responder "quantos e quem
-- clicou, assinou, desistiu ou deu erro". Mesma forma da telemetria de IA
-- (ia_eventos): leitura só por admin, retenção na limpeza diária.
--
-- Quem escreve o quê:
--   - o app (sessão do usuário) registra o que ele mesmo fez: clicou e a
--     sessão de checkout abriu, ou falhou ao abrir;
--   - o webhook (service role) registra o que só o Stripe sabe: pagamento
--     confirmado, plano trocado, assinatura cancelada, cobrança falhada e
--     checkout abandonado.
--
-- A separação importa: os eventos de "verdade financeira" não estão na lista
-- que o usuário autenticado pode inserir, então ninguém forja um
-- "assinatura_ativada" pelo navegador.

create table public.assinatura_eventos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  evento text not null check (evento in (
    'checkout_iniciado',      -- clicou em assinar e a sessão do Stripe abriu
    'checkout_erro',          -- não deu para abrir (config errada, Stripe recusou)
    'checkout_expirado',      -- desistiu: a sessão venceu sem pagamento
    'assinatura_ativada',     -- pagamento confirmado, plano liberado
    'plano_trocado',          -- upgrade/downgrade na assinatura existente
    'assinatura_cancelada',   -- encerrada (cancelamento ou falta de pagamento)
    'pagamento_falhou'        -- cobrança recusada; Stripe ainda vai retentar
  )),
  plano text,
  detalhe text,               -- motivo do erro / status do Stripe
  stripe_session_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);

create index assinatura_eventos_data_idx
  on public.assinatura_eventos (created_at desc);
create index assinatura_eventos_evento_idx
  on public.assinatura_eventos (evento, created_at desc);
create index assinatura_eventos_usuario_idx
  on public.assinatura_eventos (user_id, created_at desc);

alter table public.assinatura_eventos enable row level security;

-- Admin lê tudo.
create policy assinatura_eventos_admin_ver on public.assinatura_eventos
  for select to authenticated
  using (public.eh_admin());

-- O usuário registra apenas os próprios eventos de tentativa. Os eventos de
-- confirmação ficam de fora de propósito (só o webhook, via service role).
create policy assinatura_eventos_insert_proprio on public.assinatura_eventos
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and evento in ('checkout_iniciado', 'checkout_erro')
    and (plano is null or length(plano) <= 40)
    and (detalhe is null or length(detalhe) <= 300)
    and (stripe_session_id is null or length(stripe_session_id) <= 100)
    and stripe_subscription_id is null
  );

-- ---------------------------------------------------------------------------
-- funil_assinatura(dias): quantos em cada etapa no período
-- ---------------------------------------------------------------------------

create or replace function public.funil_assinatura(dias integer default 30)
returns table (
  evento text,
  total bigint,
  usuarios bigint
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
    select e.evento,
           count(*)::bigint as total,
           count(distinct e.user_id)::bigint as usuarios
      from public.assinatura_eventos e
     where e.created_at > now() - make_interval(days => dias)
     group by e.evento
     order by count(*) desc;
end;
$$;

revoke execute on function public.funil_assinatura(integer) from public;
revoke execute on function public.funil_assinatura(integer) from anon;
grant execute on function public.funil_assinatura(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- eventos_assinatura_recentes(): quem fez o quê
--
-- O email vive em auth.users, fora do alcance da RLS do app. SECURITY DEFINER
-- permite o join, e a checagem de admin no início é o que guarda o acesso.
-- ---------------------------------------------------------------------------

create or replace function public.eventos_assinatura_recentes(
  limite integer default 40
)
returns table (
  id uuid,
  evento text,
  email text,
  empresa text,
  plano text,
  detalhe text,
  created_at timestamptz
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
    select e.id,
           e.evento,
           u.email::text,
           c.nome_empresa,
           e.plano,
           e.detalhe,
           e.created_at
      from public.assinatura_eventos e
      left join auth.users u on u.id = e.user_id
      left join public.contas c on c.user_id = e.user_id
     order by e.created_at desc
     limit least(greatest(limite, 1), 200);
end;
$$;

revoke execute on function public.eventos_assinatura_recentes(integer) from public;
revoke execute on function public.eventos_assinatura_recentes(integer) from anon;
grant execute on function public.eventos_assinatura_recentes(integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Retenção: os eventos de assinatura entram na limpeza diária (90 dias)
-- ---------------------------------------------------------------------------

create or replace function public.limpar_dados_antigos()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Retenção (edite aqui):
  dias_licitacao int := 90;   -- licitações/matches encerrados (ou sem data)
  dias_doc_texto int := 60;   -- texto do edital anexado, após inatividade
  dias_conversa  int := 180;  -- conversa inteira, após inatividade (6 meses)
  dias_eventos   int := 90;   -- eventos de analytics, de IA e de assinatura
begin
  delete from public.licitacoes l
  where (
      (l.data_encerramento_proposta is not null
        and l.data_encerramento_proposta < now() - make_interval(days => dias_licitacao))
      or (l.data_encerramento_proposta is null
        and l.created_at < now() - make_interval(days => dias_licitacao))
    )
    and not exists (select 1 from public.favoritos f where f.licitacao_id = l.id)
    and not exists (select 1 from public.conversas_ia c where c.licitacao_id = l.id);

  delete from public.conversas_ia c
  where greatest(
      c.updated_at,
      coalesce(
        (select max(m.created_at) from public.mensagens_ia m
          where m.conversa_id = c.id),
        c.updated_at
      )
    ) < now() - make_interval(days => dias_conversa);

  update public.conversas_ia c
  set documento_nome = null,
      documento_texto = null,
      documento_caracteres = null,
      documento_cabecalho = null,
      documento_sumario = null
  where c.documento_texto is not null
    and greatest(
      c.updated_at,
      coalesce(
        (select max(m.created_at) from public.mensagens_ia m
          where m.conversa_id = c.id),
        c.updated_at
      )
    ) < now() - make_interval(days => dias_doc_texto);

  delete from public.documento_trechos t
  where not exists (
    select 1 from public.conversas_ia c
    where c.id = t.conversa_id and c.documento_texto is not null
  );

  delete from public.pagina_eventos e
  where e.created_at < now() - make_interval(days => dias_eventos);

  delete from public.ia_eventos e
  where e.created_at < now() - make_interval(days => dias_eventos);

  delete from public.assinatura_eventos e
  where e.created_at < now() - make_interval(days => dias_eventos);
end;
$$;

revoke execute on function public.limpar_dados_antigos() from public;
