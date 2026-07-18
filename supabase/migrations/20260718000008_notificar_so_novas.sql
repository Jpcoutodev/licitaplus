-- Licitaplus — notificar apenas licitações novas
--
-- Regra de produto: no cadastro (ou edição) do perfil, o acervo de licitações
-- já abertas entra no painel SEM disparar email; o alerta por email fica
-- reservado ao que for PUBLICADO no PNCP depois da criação do perfil.
--
-- Mecânica: licitacoes ganha data_publicacao_pncp; executar_matching grava o
-- match do backlog já com notificado_em preenchido (silencioso) e deixa nulo
-- (= notificar) apenas quando a publicação é posterior ao perfil.

alter table public.licitacoes
  add column data_publicacao_pncp timestamptz;

-- Backfill a partir do raw_json (nomes diferem entre a rota oficial e a busca
-- textual do portal).
update public.licitacoes
   set data_publicacao_pncp = coalesce(
     nullif(raw_json ->> 'dataPublicacaoPncp', '')::timestamptz,
     nullif(raw_json ->> 'data_publicacao_pncp', '')::timestamptz
   )
 where raw_json is not null;

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
    -- Backlog (publicada antes do perfil existir): match silencioso.
    -- Publicação posterior ao perfil (ou data desconhecida): notificar.
    case
      when l.data_publicacao_pncp is not null
       and l.data_publicacao_pncp < v_perfil.created_at
      then now()
      else null
    end
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

-- Aplica a mesma regra ao que já está pendente: matches do backlog que ainda
-- não foram notificados deixam de gerar email (continuam visíveis no painel).
update public.matches m
   set notificado_em = now()
  from public.licitacoes l,
       public.perfis p
 where m.licitacao_id = l.id
   and m.perfil_id = p.id
   and m.notificado_em is null
   and l.data_publicacao_pncp is not null
   and l.data_publicacao_pncp < p.created_at;
