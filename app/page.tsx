import Link from "next/link";

export default function PaginaInicial() {
  return (
    <>
      <section className="hero">
        <h1>Licitações públicas sob medida para a sua empresa</h1>
        <p>
          O Licitaplus monitora o Portal Nacional de Contratações Públicas
          (PNCP) e envia por email as oportunidades que combinam com o que a
          sua empresa vende — com resumo em linguagem simples, valor e prazo.
        </p>
        <Link href="/login" className="botao">
          Criar conta gratuita
        </Link>
      </section>

      <section className="grade-3">
        <div className="cartao">
          <h3>1. Monte seu perfil</h3>
          <p>
            Diga o que você vende (palavras-chave), em quais estados atua e as
            modalidades de licitação que interessam.
          </p>
        </div>
        <div className="cartao">
          <h3>2. Nós vigiamos o PNCP</h3>
          <p>
            O sistema consulta o portal oficial várias vezes ao dia e cruza
            cada nova licitação com o seu perfil.
          </p>
        </div>
        <div className="cartao">
          <h3>3. Você recebe o alerta</h3>
          <p>
            Chega um email com resumo claro: o que estão comprando, quem
            compra, valor estimado e até quando enviar proposta.
          </p>
        </div>
      </section>
    </>
  );
}
