-- SentinelaGov — minha_assinatura() apenas para usuários logados
-- (o default privilege do Supabase concede EXECUTE a anon; revoga explícito.)
revoke execute on function public.minha_assinatura() from anon;
