-- SentinelaGov — RAG do documento anexado (recuperação lexical)
--
-- Documentos grandes não cabem no contexto da IA. O texto extraído passa a
-- morar só no servidor: o começo do documento fica em coluna própria
-- (sempre enviado) e o corpo é fatiado em trechos indexados por tsvector —
-- a cada pergunta, os trechos mais relevantes são recuperados por busca
-- textual (websearch_to_tsquery). Sem dependência de API de embeddings; se
-- um dia valer a pena, uma coluna vector pode ser adicionada aqui sem
-- retrabalho.

alter table public.conversas_ia
  add column documento_caracteres integer,
  add column documento_cabecalho text;

update public.conversas_ia
   set documento_caracteres = char_length(documento_texto),
       documento_cabecalho = left(documento_texto, 20000)
 where documento_texto is not null;

create table public.documento_trechos (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.conversas_ia (id) on delete cascade,
  ordem integer not null,
  conteudo text not null,
  tsv tsvector generated always as (to_tsvector('portuguese', conteudo)) stored,
  unique (conversa_id, ordem)
);

create index documento_trechos_tsv_idx on public.documento_trechos using gin (tsv);

alter table public.documento_trechos enable row level security;

create policy trechos_select_proprio on public.documento_trechos
  for select to authenticated
  using (
    exists (
      select 1 from public.conversas_ia c
      where c.id = documento_trechos.conversa_id
        and c.user_id = (select auth.uid())
    )
  );

create policy trechos_insert_proprio on public.documento_trechos
  for insert to authenticated
  with check (
    exists (
      select 1 from public.conversas_ia c
      where c.id = documento_trechos.conversa_id
        and c.user_id = (select auth.uid())
    )
  );

create policy trechos_delete_proprio on public.documento_trechos
  for delete to authenticated
  using (
    exists (
      select 1 from public.conversas_ia c
      where c.id = documento_trechos.conversa_id
        and c.user_id = (select auth.uid())
    )
  );

-- Recupera os trechos mais relevantes para uma pergunta (security invoker:
-- o RLS acima vale para quem chama). A consulta usa OU entre os termos —
-- perguntas naturais trazem palavras que não estão no edital ("precisa",
-- "qual") e o E de websearch_to_tsquery zeraria o resultado; o ranking
-- (ts_rank) garante que trechos casando mais termos venham primeiro.
create or replace function public.buscar_trechos_documento(
  p_conversa_id uuid,
  p_consulta text,
  p_limite integer default 12
)
returns table (ordem integer, conteudo text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_e tsquery;
  v_ou tsquery;
begin
  v_e := plainto_tsquery('portuguese', p_consulta);
  if numnode(v_e) = 0 then
    return;
  end if;
  -- Converte o E de plainto_tsquery em OU ('a & b' -> 'a | b').
  v_ou := to_tsquery('portuguese', replace(v_e::text, ' & ', ' | '));

  return query
  select t.ordem, t.conteudo
    from public.documento_trechos t
   where t.conversa_id = p_conversa_id
     and t.tsv @@ v_ou
   order by ts_rank(t.tsv, v_ou) desc, t.ordem asc
   limit greatest(1, least(p_limite, 30));
end;
$$;
