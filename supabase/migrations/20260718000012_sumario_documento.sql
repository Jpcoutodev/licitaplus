-- Licitaplus — sumário do documento anexado
--
-- Um índice de títulos/seções detectados no documento, calculado no anexo e
-- sempre enviado à IA. Dá visão de ESTRUTURA (ex.: "o Anexo I está no corpo
-- do edital") mesmo no modo trechos, em que a IA não vê o documento inteiro.

alter table public.conversas_ia
  add column documento_sumario text;
