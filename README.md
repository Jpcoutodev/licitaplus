# Licitaplus

Monitor de licitações do PNCP (Portal Nacional de Contratações Públicas) para PMEs.
O sistema lê os perfis cadastrados (palavras-chave, UFs, modalidades), coleta apenas
as contratações compatíveis, gera um resumo em linguagem simples com IA e envia
alertas por email.

## Stack

- **Supabase** — Postgres, Auth, Edge Functions, pg_cron + pg_net
- **Next.js (Vercel)** — frontend
- **Resend** — envio de email
- **Anthropic (claude-haiku-4-5)** — geração dos resumos (somente via Edge Function)

## Estrutura

```
supabase/
  migrations/   ← schema versionado (nunca alterar o banco manualmente)
  functions/    ← Edge Functions (coleta, matching, notificação)
```

## Estado das fases

- [x] Fase 1 — Schema + migrations + RLS
- [ ] Fase 2 — Cliente PNCP (módulo isolado)
- [ ] Fase 3 — Worker de coleta e matching
- [ ] Fase 4 — Resumo IA + email
- [ ] Fase 5 — Frontend

## Como aplicar as migrations (primeira vez)

Pré-requisito: conta no [supabase.com](https://supabase.com). A CLI é usada via
`npx` (não precisa instalar nada globalmente).

1. **Criar o projeto** no dashboard do Supabase (New project). Guarde a senha do
   banco. Anote o *Project Ref* (código na URL do projeto, ex.: `abcdefghijklm`).

2. **Login na CLI** (abre o navegador):

   ```powershell
   npx supabase login
   ```

3. **Vincular este repositório ao projeto**:

   ```powershell
   npx supabase link --project-ref SEU_PROJECT_REF
   ```

4. **Aplicar as migrations**:

   ```powershell
   npx supabase db push
   ```

5. Conferir no dashboard (Table Editor) se as tabelas `perfis`, `licitacoes` e
   `matches` existem e se o RLS aparece como habilitado nas três.

## Regras do banco (resumo)

- `licitacoes.numero_controle_pncp` é `UNIQUE` — é o mecanismo de idempotência
  da coleta.
- `matches (perfil_id, licitacao_id)` é `UNIQUE` — idempotência do matching.
- `matches.notificado_em` nulo = email ainda não enviado — idempotência da
  notificação.
- RLS: usuário só enxerga os próprios `perfis` e `matches`; `licitacoes` é
  leitura para qualquer autenticado; **toda escrita** em `licitacoes` e
  `matches` acontece só pelo worker (service role).
