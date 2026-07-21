-- SentinelaGov — cursor de paginação da coleta
--
-- O PNCP pode ter milhares de registros por fatia (UF × modalidade) e responde
-- lento; uma invocação da Edge Function não percorre tudo. Esta tabela guarda
-- a próxima página de cada fatia: cada janela do cron continua de onde a
-- anterior parou e, ao terminar a varredura, recomeça da página 1 (para captar
-- as licitações novas).

create table public.coleta_progresso (
  uf char(2) not null,
  -- 0 = fatia sem filtro de modalidade ("todas")
  modalidade int not null default 0,
  proxima_pagina int not null default 1,
  atualizado_em timestamptz not null default now(),
  primary key (uf, modalidade)
);

-- Tabela interna do worker: RLS ligado e sem policies = acesso só via service role.
alter table public.coleta_progresso enable row level security;
