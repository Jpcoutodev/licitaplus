# SentinelaGov

Monitor de licitações do PNCP (Portal Nacional de Contratações Públicas) para PMEs.
O sistema lê os perfis cadastrados (palavras-chave, UFs, modalidades), coleta apenas
as contratações compatíveis, gera um resumo em linguagem simples com IA e envia
alertas por email.

## Stack

- **Supabase** — Postgres, Auth, Edge Functions, pg_cron + pg_net
- **Next.js (Vercel)** — frontend
- **Resend** — envio de email
- **MiniMax (MiniMax-M2)** — geração dos resumos (somente via Edge Function; provedor isolado em `_shared/notificacao/resumo.ts`)

## Estrutura

```
app/            ← frontend Next.js (landing, login, painel, perfil)
lib/            ← validação (zod), limites por plano, clients Supabase
supabase/
  migrations/   ← schema versionado (nunca alterar o banco manualmente)
  functions/    ← Edge Functions (coleta, matching, notificação)
```

## Rodar o frontend

```powershell
copy .env.example .env.local   # e preencha com URL e anon key do projeto
npm install
npm run dev                    # http://localhost:3000
```

Deploy na Vercel: importar o repositório e definir as duas variáveis
`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`. A service role
key **nunca** entra no frontend.

## Estado das fases

- [x] Fase 1 — Schema + migrations + RLS
- [x] Fase 2 — Cliente PNCP (módulo isolado)
- [x] Fase 3 — Worker de coleta e matching
- [x] Fase 4 — Resumo IA + email
- [x] Fase 5 — Frontend

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

## Deploy das Edge Functions (Fase 3)

```powershell
npx supabase functions deploy coletar
npx supabase functions deploy busca-retroativa
npx supabase functions deploy notificar
```

Segredos das integrações (Fase 4) — nunca commitados, só em secrets do Supabase:

```powershell
npx supabase secrets set MINIMAX_API_KEY=sua_chave_minimax
npx supabase secrets set RESEND_API_KEY=sua_chave_resend
npx supabase secrets set RESEND_FROM_EMAIL="SentinelaGov <alertas@seudominio.com.br>"
```

Opcionais (têm padrão): `MINIMAX_MODEL` (MiniMax-M2) e `MINIMAX_API_BASE_URL`
(https://api.minimax.io/v1).

### Emails de autenticação (senha e confirmação de cadastro)

Os emails de licitação saem pelo Resend, com o domínio do projeto. Os emails de
**autenticação** são outra coisa: quem envia é o Auth do Supabase, que por
padrão usa o remetente `noreply@mail.app.supabase.io`, em inglês e com rodapé
"powered by Supabase". Além da aparência, esse remetente padrão é limitado a
poucos emails por hora e o próprio Supabase não o recomenda em produção.

Para o cliente receber do SentinelaGov, configure no dashboard:

**1. SMTP próprio** — Authentication → Emails → SMTP Settings, com as
credenciais SMTP do mesmo Resend que o app já usa:

| Campo | Valor |
| --- | --- |
| Host | `smtp.resend.com` |
| Porta | `465` (SSL) ou `587` (TLS) |
| Usuário | `resend` |
| Senha | a mesma chave de `RESEND_API_KEY` |
| Sender email | um endereço do domínio verificado no Resend |
| Sender name | `SentinelaGov` |

**2. Templates** — Authentication → Emails, colando o conteúdo de
`supabase/templates/recuperar-senha.html` em *Reset Password* e
`supabase/templates/confirmar-cadastro.html` em *Confirm signup*.

Os templates usam `{{ .ConfirmationURL }}`, e **não** `{{ .TokenHash }}`. O
motivo é o fluxo de autenticação do app: `@supabase/ssr` trabalha em PKCE, e
nesse fluxo o `{{ .TokenHash }}` sai com prefixo `pkce_` — que não é um token de
OTP, é um código de autorização. Verificá-lo como OTP devolve sempre "Email link
is invalid or has expired". O ConfirmationURL passa pelo verificador do próprio
Supabase e volta para `/auth/callback`, que troca o código por sessão.

Ganho colateral: o endereço de retorno vem do `redirectTo` que o app envia, ou
seja, do domínio de quem pediu. Funciona em produção e em desenvolvimento sem
depender do campo **Site URL**, que é um valor global único (se ele estiver como
`http://localhost:3000`, todo link de email criado a partir de `.SiteURL` sai
apontando para localhost — inclusive nos emails que chegam a clientes).

Limitação herdada do PKCE, que vale conhecer: o link precisa ser aberto **no
mesmo navegador** onde foi pedido, porque o verificador fica num cookie daquele
navegador. Pedir no computador e abrir no celular não funciona — e a tela de
login explica isso quando acontece, em vez de mostrar erro genérico. As duas
rotas existem e tratam os dois formatos (`/auth/callback` para o `?code=` e
`/auth/confirm` para `token_hash`, inclusive o `pkce_`), então nenhum link
configurado fica órfão.

**3. URLs** — Authentication → URL Configuration:

- **Site URL**: o domínio de produção (`https://sentinelagov.com`). Deixar
  `http://localhost:3000` aqui faz links de email apontarem para a máquina do
  desenvolvedor.
- **Redirect URLs**: precisa conter `https://sentinelagov.com/auth/callback` e
  `https://sentinelagov.com/auth/confirm`. Para desenvolver, acrescente também
  `http://localhost:3000/**`.

Depois, criar os segredos que o agendamento (pg_cron) usa para chamar a
function — rodar **uma vez** no SQL Editor do projeto:

```sql
select vault.create_secret('https://SEU_PROJECT_REF.supabase.co', 'project_url');
select vault.create_secret('SUA_SERVICE_ROLE_KEY', 'service_role_key');
```

O job `sentinelagov-coletar` (criado pela migration `0004`) roda a cada 30
minutos: lê os perfis ativos, deriva o conjunto mínimo de consultas
(UF × modalidade), coleta do PNCP e grava os matches. Para testar manualmente:

```powershell
npx supabase functions invoke coletar
```

`busca-retroativa` é chamada pelo frontend após salvar um perfil (exige o JWT
do usuário dono do perfil) e coleta imediatamente as fatias daquele perfil.

## Pagamentos (Stripe)

Três peças: as rotas `/api/assinar/checkout` e `/api/assinar/portal` (rodam na
Vercel) e a edge function `stripe-webhook` (roda no Supabase e é quem de fato
libera o plano). O projeto **não usa** a chave publicável nem Stripe.js — o
checkout é um redirect server-side.

Na Stripe, criar dois produtos com preço **recorrente mensal em BRL**
(Essencial R$ 97 e Profissional R$ 197) e anotar os IDs de **preço**
(`price_...`, não `prod_...`). Depois criar o webhook apontando para
`https://SEU_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`, assinando
os eventos:

```
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

Variáveis na **Vercel**: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ESSENCIAL`,
`STRIPE_PRICE_PROFISSIONAL`.

Secrets no **Supabase** (as mesmas três + o segredo do endpoint):

```powershell
npx supabase secrets set STRIPE_SECRET_KEY=sk_...
npx supabase secrets set STRIPE_PRICE_ESSENCIAL=price_...
npx supabase secrets set STRIPE_PRICE_PROFISSIONAL=price_...
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
npx supabase functions deploy stripe-webhook
```

Os `price_` precisam ser **os mesmos** nos dois lados: o webhook usa o price
para decidir o plano e ignora o evento se não reconhecer nenhum (falha alta,
de propósito — classificar errado significaria cobrar R$197 entregando R$97).

O deploy dispensa `--no-verify-jwt`: `config.toml` já traz
`[functions.stripe-webhook] verify_jwt = false`, porque a Stripe não manda JWT
do Supabase.

Notas de compatibilidade:

- Desde a API `2025-03-31.basil` o `current_period_end` **saiu** do objeto
  Subscription e vive em `items.data[].current_period_end`. O webhook lê do
  item com fallback para o campo antigo.
- Trial é do app (14 dias, controlados em `contas.created_at`), não da Stripe —
  o checkout não usa `trial_period_days`.
- Troca de plano de quem já assina **atualiza a assinatura existente** em vez
  de abrir novo checkout; abrir um segundo geraria duas cobranças mensais.

## Regras do banco (resumo)

- `licitacoes.numero_controle_pncp` é `UNIQUE` — é o mecanismo de idempotência
  da coleta.
- `matches (perfil_id, licitacao_id)` é `UNIQUE` — idempotência do matching.
- `matches.notificado_em` nulo = email ainda não enviado — idempotência da
  notificação.
- RLS: usuário só enxerga os próprios `perfis` e `matches`; `licitacoes` é
  leitura para qualquer autenticado; **toda escrita** em `licitacoes` e
  `matches` acontece só pelo worker (service role).
