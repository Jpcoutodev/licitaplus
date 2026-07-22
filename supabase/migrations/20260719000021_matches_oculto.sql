-- SentinelaGov — permitir ocultar uma licitação do painel
--
-- "oculto" marca um match que o usuário não quer mais ver no painel. Sobrevive
-- à recoleta: o matching insere com `on conflict (perfil_id, licitacao_id) do
-- nothing`, então uma linha já oculta permanece oculta.

alter table public.matches
  add column oculto boolean not null default false;

create index matches_perfil_oculto_idx on public.matches (perfil_id, oculto);

-- O dono pode ocultar/reexibir os próprios matches. A política libera a linha;
-- o privilégio de coluna abaixo restringe a escrita apenas a `oculto`.
create policy matches_update_oculto on public.matches
  for update to authenticated
  using (
    exists (
      select 1 from public.perfis p
      where p.id = matches.perfil_id
        and p.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.perfis p
      where p.id = matches.perfil_id
        and p.user_id = (select auth.uid())
    )
  );

-- Menor privilégio: authenticated só pode atualizar a coluna `oculto`
-- (nunca perfil_id, licitacao_id ou notificado_em). O worker usa service_role,
-- que ignora tanto a RLS quanto estes grants.
revoke update on public.matches from authenticated;
grant update (oculto) on public.matches to authenticated;
