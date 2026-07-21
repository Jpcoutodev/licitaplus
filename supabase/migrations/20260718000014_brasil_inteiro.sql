-- SentinelaGov — perfil com opção "Brasil inteiro"
--
-- brasil_inteiro = true: monitora o país todo (o PNCP aceita consulta
-- nacional, mais eficiente que 27 consultas por estado). false: usa as UFs
-- selecionadas, como antes. O matching ignora o filtro de UF quando nacional.

alter table public.perfis
  add column brasil_inteiro boolean not null default false;

create or replace function public.executar_matching(
  p_perfil_id uuid,
  p_termos text[]
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_perfil public.perfis%rowtype;
  v_consulta tsquery;
  v_termo_query tsquery;
  v_termo text;
  v_inseridos integer;
begin
  select * into v_perfil
    from public.perfis
   where id = p_perfil_id
     and ativo;
  if not found then
    return 0;
  end if;

  foreach v_termo in array coalesce(p_termos, '{}') loop
    continue when length(trim(v_termo)) = 0;
    v_termo_query := plainto_tsquery('portuguese', v_termo);
    if numnode(v_termo_query) > 0 then
      v_consulta := case
        when v_consulta is null then v_termo_query
        else v_consulta || v_termo_query  -- || em tsquery = OR
      end;
    end if;
  end loop;

  if v_consulta is null then
    return 0;
  end if;

  insert into public.matches (perfil_id, licitacao_id, notificado_em)
  select
    v_perfil.id,
    l.id,
    case
      when l.data_publicacao_pncp is not null
       and l.data_publicacao_pncp < v_perfil.updated_at
      then now()
      else null
    end
    from public.licitacoes l
   where (v_perfil.brasil_inteiro or l.uf = any (v_perfil.ufs))
     and (
       cardinality(v_perfil.modalidades) = 0
       or l.modalidade_id = any (v_perfil.modalidades)
     )
     and (
       l.data_encerramento_proposta is null
       or l.data_encerramento_proposta >= now()
     )
     and l.objeto_tsv @@ v_consulta
  on conflict (perfil_id, licitacao_id) do nothing;

  get diagnostics v_inseridos = row_count;
  return v_inseridos;
end;
$$;
