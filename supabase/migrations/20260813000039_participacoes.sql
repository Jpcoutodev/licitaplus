-- SentinelaGov — Licitando: as licitações em que a empresa está participando
--
-- Favorito é "quero olhar"; participação é "estou dentro". São duas listas
-- separadas de propósito: favoritar não inscreve ninguém, e participar não
-- favorita. O status é o que a empresa anota à mão conforme a disputa anda —
-- é o que transforma a aba num acompanhamento e não em outra lista de links.
--
-- As datas que a aba usa (abertura e encerramento do recebimento de propostas)
-- já vêm do PNCP e já estão em `licitacoes`; nada muda na coleta.

create table public.participacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  licitacao_id uuid not null references public.licitacoes (id) on delete cascade,
  -- 'acompanhando' é o estado de quem acabou de clicar em Participar; o resto
  -- é o desfecho, marcado pela empresa.
  status text not null default 'acompanhando'
    check (status in (
      'acompanhando',      -- entrou na disputa, proposta ainda não enviada
      'proposta_enviada',  -- proposta entregue, aguardando o julgamento
      'ganhei',            -- venceu
      'perdi',             -- perdeu
      'desisti'            -- saiu antes do fim
    )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, licitacao_id)
);

create index participacoes_user_id_idx on public.participacoes (user_id);
create index participacoes_licitacao_id_idx
  on public.participacoes (licitacao_id);

create trigger participacoes_atualizado
  before update on public.participacoes
  for each row execute function public.atualizar_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: cada empresa só vê e mexe nas próprias participações
-- ---------------------------------------------------------------------------

alter table public.participacoes enable row level security;

create policy participacoes_select_proprio on public.participacoes
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy participacoes_insert_proprio on public.participacoes
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- O update existe por causa do status (o único campo que a empresa edita).
create policy participacoes_update_proprio on public.participacoes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy participacoes_delete_proprio on public.participacoes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Retenção: participação segura a licitação, como favorito e conversa já faziam
--
-- Sem isto a limpeza diária apagaria a licitação 90 dias depois do
-- encerramento e a participação iria junto pelo cascade — o histórico de
-- "ganhei/perdi" da empresa desapareceria justamente quando começa a ter
-- valor. Corpo idêntico ao da migração 31, com o novo `not exists`.
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
    and not exists (
      select 1 from public.participacoes p where p.licitacao_id = l.id
    )
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
