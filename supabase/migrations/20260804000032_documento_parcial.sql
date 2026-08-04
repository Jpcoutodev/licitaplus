-- SentinelaGov — leitura de PDF grande em várias etapas
--
-- Editais de centenas de páginas não cabem no limite de 2s de CPU por
-- requisição das Edge Functions (limite igual em todos os planos). A leitura
-- passa a ser feita em faixas de página, e o texto lido até agora fica aqui.
--
-- Coluna separada de propósito: usar documento_texto como rascunho apagaria um
-- documento já anexado assim que a primeira faixa do novo fosse gravada. Com o
-- rascunho à parte, o documento vigente só é tocado quando a leitura termina —
-- e a junção com um anexo anterior continua funcionando como antes.

alter table public.conversas_ia
  add column documento_parcial text;

comment on column public.conversas_ia.documento_parcial is
  'Rascunho da leitura de PDF em faixas; nulo fora de uma leitura em andamento.';
