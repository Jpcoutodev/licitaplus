-- SentinelaGov — admin pode excluir leads de consultoria (spam/limpeza)
create policy consultoria_admin_excluir on public.consultoria_leads
  for delete to authenticated
  using (public.eh_admin());
