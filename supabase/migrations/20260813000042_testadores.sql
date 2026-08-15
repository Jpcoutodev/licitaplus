-- SentinelaGov — testadores externos
--
-- Duas empresas testando o sistema para o dono do projeto. Papel 'testador':
-- usam tudo sem limites de plano (sem trial, sem vencimento, sem teto de
-- análises) e enxergam a aba Leads, mas não a aba Métricas nem o modo
-- administração dos chamados — os números do negócio e os chamados de clientes
-- reais ficam fora.
--
-- Acesso temporário por natureza. Para revogar quando o teste terminar:
--   delete from public.admins where email in (
--     'gavioli.tati@gmail.com', 'jcfavinha@gmail.com'
--   );

insert into public.admins (email, papel) values
  ('gavioli.tati@gmail.com', 'testador'),  -- Licitarepró
  ('jcfavinha@gmail.com', 'testador')      -- licitare
on conflict (email) do update set papel = 'testador';
