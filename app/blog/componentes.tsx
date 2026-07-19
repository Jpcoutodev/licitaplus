import Link from "next/link";
import type { ItemFaq } from "@/lib/blog/tipos";

/** Resposta direta no topo do artigo — o que os motores de IA extraem. */
export function Resposta({ children }: { children: React.ReactNode }) {
  return (
    <div className="artigo-resposta">
      <span className="artigo-resposta-rotulo">Resposta rápida</span>
      <p>{children}</p>
    </div>
  );
}

/** Caixa de destaque neutra (dica, observação). */
export function Destaque({
  titulo,
  children,
}: {
  titulo?: string;
  children: React.ReactNode;
}) {
  return (
    <aside className="artigo-destaque">
      {titulo && <strong>{titulo}</strong>}
      <div>{children}</div>
    </aside>
  );
}

/** CTA de conversão inline — link estático marcado para o rastreio de conversão. */
export function CtaTeste({
  titulo = "Deixe a busca com o Licitaplus",
  texto = "Receba por email as licitações compatíveis com a sua empresa, com resumo em linguagem simples e análise com IA. Teste grátis por 14 dias, sem cartão.",
  rotulo = "Começar teste grátis",
}: {
  titulo?: string;
  texto?: string;
  rotulo?: string;
}) {
  return (
    <div className="artigo-cta">
      <h3>{titulo}</h3>
      <p>{texto}</p>
      <Link href="/login" className="botao botao-grande botao-claro" data-cta-teste>
        {rotulo}
      </Link>
    </div>
  );
}

/** Bloco de FAQ visível (casa com o FAQPage JSON-LD). */
export function Faq({ itens }: { itens: ItemFaq[] }) {
  return (
    <section className="artigo-faq">
      <h2>Perguntas frequentes</h2>
      <div className="lp-faq">
        {itens.map((item) => (
          <details className="lp-faq-item" key={item.p}>
            <summary>{item.p}</summary>
            <p className="texto-suave">{item.r}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
