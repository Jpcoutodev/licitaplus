-- SentinelaGov — devolve à fila do backfill as tentativas sem motivo
--
-- A primeira rodada de `completar-pendentes` marcava a tentativa igual para
-- todo mundo, sem separar "o PNCP não tem a ficha" de "o PNCP não respondeu".
-- Como a API do PNCP oscila bastante (metade das falhas da primeira rodada foi
-- indisponibilidade, não ausência de dado), essas licitações ficariam sete dias
-- fora da fila por um problema de rede.
--
-- A função já distingue os dois casos e aplica carência de ~1 hora para
-- indisponibilidade. Aqui só limpamos a marca cega, para a nova lógica decidir.

update public.licitacoes
   set completar_tentado_em = null
 where data_encerramento_proposta is null
   and completar_tentado_em is not null;
