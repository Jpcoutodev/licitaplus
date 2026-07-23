import Link from "next/link";
import { redirect } from "next/navigation";
import { criarClientServidor } from "@/lib/supabase/server";
import { Logo } from "../logo";

export const metadata = { robots: { index: false, follow: false } };

interface Assinatura {
  estado: string;
  plano: string;
  trial_fim: string | null;
  ativo_ate: string | null;
  analises_usadas: number;
  analises_limite: number;
}

const PLANOS = [
  {
    id: "essencial",
    nome: "Essencial",
    preco: "R$ 97",
    itens: [
      "1 perfil de busca (estados ou Brasil inteiro)",
      "30 análises de IA por mês",
      "Alertas por email e push",
      "Resumo executivo do edital",
      "Chat com IA sobre o edital",
    ],
    destaque: false,
  },
  {
    id: "profissional",
    nome: "Profissional",
    preco: "R$ 197",
    itens: [
      "3 perfis de busca independentes",
      "100 análises de IA por mês",
      "Alertas por email e push",
      "Resumo executivo do edital",
      "Chat com IA sobre o edital",
      "Suporte prioritário",
    ],
    destaque: true,
  },
];

export default async function PaginaAssinar({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await criarClientServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .rpc("minha_assinatura")
    .maybeSingle<Assinatura>();
  const ass = data ?? null;
  const ativo = ass?.estado === "ativo" || ass?.estado === "admin";
  const expirado = ass?.estado === "expirado";

  return (
    <div style={{ maxWidth: 860, margin: "40px auto", padding: "0 20px" }}>
      <p style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
        <Link href="/painel" aria-label="SentinelaGov">
          <Logo />
        </Link>
      </p>

      <div style={{ textAlign: "center", marginBottom: 26 }}>
        <h1 style={{ marginBottom: 8 }}>
          {ativo
            ? "Sua assinatura"
            : expirado
              ? "Seu teste grátis terminou"
              : "Escolha seu plano"}
        </h1>
        <p className="texto-suave">
          {ativo
            ? `Plano ${ass?.plano} ativo${ass?.ativo_ate ? ` até ${new Date(ass.ativo_ate).toLocaleDateString("pt-BR")}` : ""}.`
            : expirado
              ? "Assine para voltar a receber alertas e analisar editais com IA."
              : "Continue encontrando as licitações certas para a sua empresa."}
        </p>
      </div>

      {sp?.ok === "1" && (
        <p className="mensagem-sucesso" style={{ textAlign: "center" }}>
          Pagamento confirmado! Sua assinatura será ativada em instantes —
          atualize a página.
        </p>
      )}
      {sp?.erro === "config" && (
        <p className="mensagem-erro" style={{ textAlign: "center" }}>
          O pagamento online está em configuração. Fale com a gente pelo email
          contato@sentinelagov.com que ativamos seu plano.
        </p>
      )}
      {sp?.erro === "stripe" && (
        <p className="mensagem-erro" style={{ textAlign: "center" }}>
          Não foi possível iniciar o pagamento agora. Tente novamente em
          instantes.
        </p>
      )}

      {ativo ? (
        <p style={{ textAlign: "center" }}>
          <Link href="/painel" className="botao">
            Ir para o painel
          </Link>
        </p>
      ) : (
        <div className="planos-grade">
          {PLANOS.map((plano) => (
            <div
              key={plano.id}
              className={`cartao plano-cartao ${plano.destaque ? "plano-destaque" : ""}`}
            >
              {plano.destaque && (
                <span className="etiqueta etiqueta-nova">Mais escolhido</span>
              )}
              <h2>{plano.nome}</h2>
              <p className="plano-preco">
                {plano.preco}
                <span>/mês</span>
              </p>
              <ul className="plano-itens">
                {plano.itens.map((item) => (
                  <li key={item}>✔ {item}</li>
                ))}
              </ul>
              <form action="/api/assinar/checkout" method="post">
                <input type="hidden" name="plano" value={plano.id} />
                <button
                  type="submit"
                  className={`botao ${plano.destaque ? "" : "botao-secundario"}`}
                  style={{ width: "100%" }}
                >
                  Assinar {plano.nome}
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      <p
        className="texto-suave"
        style={{ textAlign: "center", marginTop: 22, fontSize: 13 }}
      >
        Pagamento seguro via Stripe · Cancele quando quiser ·{" "}
        <Link href="/painel">Voltar ao painel</Link>
      </p>
    </div>
  );
}
