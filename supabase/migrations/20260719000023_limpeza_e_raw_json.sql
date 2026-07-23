-- SentinelaGov — corte de storage: remove raw_json + limpeza periódica (TTL)
--
-- 1) raw_json guardava o JSON bruto do PNCP "para reprocessar", mas nada o lê
--    em runtime (data_publicacao_pncp já é coluna própria). É o maior peso da
--    tabela licitacoes — removido.
-- 2) Job diário que apaga dados vencidos. Prazos centralizados no topo da
--    função (metade dos valores conservadores). Favoritas e chamados nunca são
--    tocados; licitações analisadas (com conversa) também são preservadas.

alter table public.licitacoes drop column if exists raw_json;

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
  dias_eventos   int := 90;   -- eventos de analytics
begin
  -- 1) Licitações encerradas há muito, que ninguém favoritou nem analisou.
  --    Os matches somem por cascata (FK on delete cascade).
  delete from public.licitacoes l
  where (
      (l.data_encerramento_proposta is not null
        and l.data_encerramento_proposta < now() - make_interval(days => dias_licitacao))
      or (l.data_encerramento_proposta is null
        and l.created_at < now() - make_interval(days => dias_licitacao))
    )
    and not exists (select 1 from public.favoritos f where f.licitacao_id = l.id)
    and not exists (select 1 from public.conversas_ia c where c.licitacao_id = l.id);

  -- 2) Conversas inativas há 6+ meses: apaga inteiras (cascata: mensagens e
  --    trechos).
  delete from public.conversas_ia c
  where greatest(
      c.updated_at,
      coalesce(
        (select max(m.created_at) from public.mensagens_ia m
          where m.conversa_id = c.id),
        c.updated_at
      )
    ) < now() - make_interval(days => dias_conversa);

  -- 3) Conversas inativas há 60+ dias (mas < 6 meses): descarta o texto pesado
  --    do edital, mantendo as mensagens do usuário.
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

  -- Trechos órfãos (de conversas cujo texto foi descartado acima).
  delete from public.documento_trechos t
  where not exists (
    select 1 from public.conversas_ia c
    where c.id = t.conversa_id and c.documento_texto is not null
  );

  -- 4) Eventos de analytics antigos.
  delete from public.pagina_eventos e
  where e.created_at < now() - make_interval(days => dias_eventos);
end;
$$;

revoke execute on function public.limpar_dados_antigos() from public;

-- Agenda diária às 05:30 UTC (~02:30 BRT), horário de baixo movimento.
do $$
begin
  perform cron.unschedule('limpeza-diaria');
exception when others then null;
end $$;

select cron.schedule(
  'limpeza-diaria',
  '30 5 * * *',
  $$ select public.limpar_dados_antigos(); $$
);
