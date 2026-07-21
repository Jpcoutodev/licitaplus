-- SentinelaGov — admin pode excluir chamados
--
-- Só administradores excluem. As mensagens do chamado saem por cascata (FK
-- on delete cascade), que roda como dona da tabela e não passa pela RLS.

create policy chamados_excluir on public.chamados
  for delete to authenticated
  using (public.eh_admin());
