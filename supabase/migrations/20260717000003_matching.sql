-- Licitaplus — Fase 3: função de matching palavra-chave x licitação
--
-- Recebe o perfil e a lista de termos já expandida com sinônimos (a expansão
-- fica no código do worker). Monta uma tsquery OR de plainto_tsquery por
-- termo (multi-palavra vira AND interno, ex.: "merenda escolar") e insere os
-- matches novos. on conflict garante idempotência: rodar duas vezes não
-- duplica nada.

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

  insert into public.matches (perfil_id, licitacao_id)
  select v_perfil.id, l.id
    from public.licitacoes l
   where l.uf = any (v_perfil.ufs)
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

-- Menor privilégio: apenas o worker (service role) executa o matching.
revoke execute on function public.executar_matching(uuid, text[]) from public;
revoke execute on function public.executar_matching(uuid, text[]) from anon;
revoke execute on function public.executar_matching(uuid, text[]) from authenticated;
