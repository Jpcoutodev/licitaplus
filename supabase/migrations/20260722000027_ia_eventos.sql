-- SentinelaGov — telemetria da análise com IA
--
-- Cada tentativa relevante (anexar documento, resumo executivo, conversa,
-- busca/favoritar pela IA) vira um evento com sucesso/erro e detalhes. Escrita
-- apenas pelo servidor (service role); leitura apenas por admins (monitoração
-- na aba Métricas).

create table public.ia_eventos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  conversa_id uuid,
  licitacao_id uuid,
  acao text not null check (acao in (
    'anexar_pncp', 'anexar_upload', 'resumo_executivo', 'conversa',
    'busca_ia', 'favoritar_ia'
  )),
  sucesso boolean not null,
  erro text,
  detalhes jsonb,
  duracao_ms integer,
  created_at timestamptz not null default now()
);

create index ia_eventos_data_idx on public.ia_eventos (created_at desc);
create index ia_eventos_acao_idx on public.ia_eventos (acao, created_at desc);

alter table public.ia_eventos enable row level security;

-- Só admins leem; nenhuma policy de escrita (insert apenas via service role).
create policy ia_eventos_admin_ver on public.ia_eventos
  for select to authenticated
  using (public.eh_admin());

-- ---------------------------------------------------------------------------
-- Limpeza diária passa a cobrir também os eventos de IA (90 dias)
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
  dias_eventos   int := 90;   -- eventos de analytics e de IA
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
end;
$$;

revoke execute on function public.limpar_dados_antigos() from public;
