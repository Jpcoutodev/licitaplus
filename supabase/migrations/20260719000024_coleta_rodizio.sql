-- SentinelaGov — rodízio da coleta (busca textual e fatias)
--
-- A busca textual cortava sempre nas N primeiras consultas (termo × UF) da
-- lista, e o loop de fatias começava sempre da mesma ordem: com muitos perfis
-- e termos, os últimos da lista nunca tinham a vez. Esta tabela guarda a
-- posição do rodízio para cada mecanismo continuar de onde parou na janela
-- anterior (round-robin), como o cursor que as fatias já têm por página.

create table public.coleta_rodizio (
  chave text primary key,          -- 'busca_textual' | 'fatias'
  posicao integer not null default 0,
  atualizado_em timestamptz not null default now()
);

-- RLS sem policies: apenas o worker (service role) lê e escreve.
alter table public.coleta_rodizio enable row level security;
