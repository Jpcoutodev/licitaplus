-- SentinelaGov — view achatada de matches + licitações para o painel
--
-- O PostgREST não ordena o recurso principal por coluna de uma tabela
-- embutida, então "encerra primeiro" (ordenar por data de encerramento) não
-- funciona no join aninhado. Esta view achata os campos, permitindo ordenar,
-- filtrar e buscar por qualquer coluna. `security_invoker = true` faz a view
-- rodar com o papel do chamador, então a RLS de matches (dono) e de licitações
-- (leitura autenticada) continua valendo — a view não abre nenhum dado novo.

create view public.painel_matches
with (security_invoker = true) as
select
  m.id,
  m.perfil_id,
  m.created_at,
  m.notificado_em,
  m.oculto,
  l.id                          as licitacao_id,
  l.numero_controle_pncp,
  l.objeto_compra,
  l.valor_total_estimado,
  l.data_encerramento_proposta,
  l.orgao_razao_social,
  l.municipio_nome,
  l.uf,
  l.modalidade_nome,
  l.link_sistema_origem
from public.matches m
join public.licitacoes l on l.id = m.licitacao_id;

grant select on public.painel_matches to authenticated;
