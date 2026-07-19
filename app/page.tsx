import Link from "next/link";

const FAQ = [
  {
    p: "O que é o Licitaplus?",
    r: "É um serviço que encontra automaticamente as licitações públicas compatíveis com o que a sua empresa vende, resume cada uma em linguagem simples e ainda ajuda você a decidir com inteligência artificial. Tudo chega no seu email — você não precisa ficar procurando em portal nenhum.",
  },
  {
    p: "Preciso entender de licitações para usar?",
    r: "Não. O Licitaplus foi feito para donos de pequenas e médias empresas que não são especialistas. Cada oportunidade vem com um resumo claro — o que estão comprando, valor, prazo — e você pode conversar com a IA para tirar dúvidas sobre o edital.",
  },
  {
    p: "Como funciona o teste grátis?",
    r: "Você cria a conta e usa por 14 dias sem custo e sem cartão de crédito. É só montar seu perfil (o que vende, onde atua) e começar a receber as oportunidades.",
  },
  {
    p: "Serve para empresa pequena ou MEI?",
    r: "Sim. A maior parte das compras públicas é de bens e serviços comuns, em que pequenas empresas competem muito bem. O Licitaplus ajuda você a não perder essas oportunidades por falta de tempo para garimpar.",
  },
  {
    p: "Consigo acompanhar o Brasil inteiro?",
    r: "Sim. Você pode focar em estados específicos ou ativar a busca no Brasil inteiro, recebendo oportunidades de todo o país que combinam com o seu perfil.",
  },
  {
    p: "De onde vêm as licitações?",
    r: "Das fontes oficiais de contratações públicas do governo brasileiro. O Licitaplus consulta esses dados várias vezes ao dia para você e entrega só o que interessa ao seu negócio.",
  },
];

const BENEFICIOS = [
  {
    titulo: "Alertas no seu email",
    texto:
      "As oportunidades certas chegam prontas na sua caixa de entrada. Nada de vasculhar portais do governo todo dia.",
    icone: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </>
    ),
  },
  {
    titulo: "Análise com IA",
    texto:
      "Converse com a IA sobre cada licitação. Ela lê o edital, explica exigências e ajuda a decidir se vale a pena participar.",
    icone: (
      <>
        <path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" />
        <path d="M9.5 11.5h.01M13 11.5h.01M16.5 11.5h.01" strokeWidth="2.4" />
      </>
    ),
  },
  {
    titulo: "Cobertura nacional",
    texto:
      "Foque no seu estado ou acompanhe o Brasil inteiro. Você define o alcance e recebe só o que combina com o seu negócio.",
    icone: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
      </>
    ),
  },
  {
    titulo: "Resumo em linguagem simples",
    texto:
      "Objeto, valor estimado e prazo para participar, sem juridiquês. Em segundos você entende a oportunidade.",
    icone: (
      <>
        <path d="M4 5h16M4 10h16M4 15h10" />
      </>
    ),
  },
  {
    titulo: "Favoritos organizados",
    texto:
      "Marque as licitações interessantes com uma estrela e mantenha tudo o que importa reunido num só lugar.",
    icone: (
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    ),
  },
  {
    titulo: "Economia de tempo",
    texto:
      "Deixe o trabalho repetitivo de busca com a gente e concentre sua energia em preparar boas propostas.",
    icone: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
];

function IconeBeneficio({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const urlSite = process.env.NEXT_PUBLIC_SITE_URL ?? "https://licitaplus.com";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "Licitaplus",
      url: urlSite,
      description:
        "Monitoramento de licitações públicas para pequenas e médias empresas, com alertas por email e análise com IA.",
    },
    {
      "@type": "SoftwareApplication",
      name: "Licitaplus",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "BRL",
        description: "Teste grátis por 14 dias, sem cartão de crédito.",
      },
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map((item) => ({
        "@type": "Question",
        name: item.p,
        acceptedAnswer: { "@type": "Answer", text: item.r },
      })),
    },
  ],
};

export default function PaginaInicial() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="lp-topo">
        <div className="container lp-topo-linha">
          <Link href="/" className="logo">
            Licita<span>plus</span>
          </Link>
          <nav className="lp-nav">
            <Link href="/blog">Blog</Link>
            <Link href="/login">Entrar</Link>
            <Link href="/login" className="botao">
              Teste grátis
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="lp-hero">
          <div className="container lp-hero-grade">
            <div>
              <span className="lp-selo">
                14 dias grátis · sem cartão de crédito
              </span>
              <h1 className="lp-titulo">
                As licitações certas para a sua empresa, todo dia no seu email
              </h1>
              <p className="lp-subtitulo">
                Pare de perder oportunidades de vender para o governo. O
                Licitaplus encontra as licitações que combinam com o seu
                negócio, resume em linguagem simples e ajuda você a decidir com
                inteligência artificial.
              </p>
              <div className="lp-cta-linha">
                <Link href="/login" className="botao botao-grande">
                  Começar teste grátis
                </Link>
                <Link
                  href="/login"
                  className="botao botao-secundario botao-grande"
                >
                  Entrar
                </Link>
              </div>
              <p className="lp-confianca">
                Sem cartão de crédito · Cancele quando quiser
              </p>
            </div>

            {/* Mockup do produto (feito em CSS, sem screenshot) */}
            <div className="lp-mockup" aria-hidden>
              <div className="lp-mockup-cartao">
                <div className="lp-mockup-topo">
                  <span className="etiqueta etiqueta-nova">novo</span>
                  <span className="lp-mockup-estrela">★</span>
                </div>
                <strong>Aquisição de equipamentos de informática</strong>
                <p>Prefeitura Municipal · SP · Pregão Eletrônico</p>
                <div className="lp-mockup-info">
                  <span>Valor: R$ 1,2 mi</span>
                  <span>Propostas até: 24/07</span>
                </div>
              </div>
              <div className="lp-mockup-chat">
                <div className="lp-bolha-usuario">Vale a pena participar?</div>
                <div className="lp-bolha-ia">
                  Sim — o objeto combina com o seu perfil e o prazo é
                  confortável. Os principais requisitos de habilitação são…
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Como funciona */}
        <section className="lp-secao container">
          <h2 className="lp-secao-titulo">Como funciona</h2>
          <p className="lp-secao-sub">
            Do cadastro ao primeiro alerta em poucos minutos.
          </p>
          <div className="lp-passos">
            <div className="lp-passo">
              <span className="lp-passo-num">1</span>
              <h3>Diga o que você vende</h3>
              <p className="texto-suave">
                Informe suas palavras-chave e onde sua empresa atua. Leva menos
                de dois minutos.
              </p>
            </div>
            <div className="lp-passo">
              <span className="lp-passo-num">2</span>
              <h3>Encontramos as oportunidades</h3>
              <p className="texto-suave">
                Nosso sistema vasculha as compras públicas várias vezes ao dia e
                separa só o que combina com você.
              </p>
            </div>
            <div className="lp-passo">
              <span className="lp-passo-num">3</span>
              <h3>Você recebe e decide com a IA</h3>
              <p className="texto-suave">
                Chega o alerta com resumo claro, e a IA ajuda a analisar o
                edital e decidir se vale participar.
              </p>
            </div>
          </div>
        </section>

        {/* Benefícios */}
        <section className="lp-secao lp-secao-alt">
          <div className="container">
            <h2 className="lp-secao-titulo">Tudo para vender mais ao governo</h2>
            <p className="lp-secao-sub">
              Menos tempo procurando, mais tempo fechando negócio.
            </p>
            <div className="lp-beneficios">
              {BENEFICIOS.map((b) => (
                <div className="lp-beneficio" key={b.titulo}>
                  <div className="lp-beneficio-icone">
                    <IconeBeneficio>{b.icone}</IconeBeneficio>
                  </div>
                  <h3>{b.titulo}</h3>
                  <p className="texto-suave">{b.texto}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="lp-secao container">
          <h2 className="lp-secao-titulo">Perguntas frequentes</h2>
          <div className="lp-faq">
            {FAQ.map((item) => (
              <details className="lp-faq-item" key={item.p}>
                <summary>{item.p}</summary>
                <p className="texto-suave">{item.r}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA final */}
        <section className="lp-cta-final">
          <div className="container">
            <h2>Comece seu teste grátis de 14 dias</h2>
            <p>
              Sem cartão de crédito. Monte seu perfil e receba as primeiras
              oportunidades hoje mesmo.
            </p>
            <Link href="/login" className="botao botao-grande botao-claro">
              Criar minha conta grátis
            </Link>
          </div>
        </section>
      </main>

      <footer className="lp-rodape">
        <div className="container lp-rodape-linha">
          <div>
            <Link href="/" className="logo">
              Licita<span>plus</span>
            </Link>
            <p className="texto-suave" style={{ marginTop: 6 }}>
              Licitações públicas sob medida para a sua empresa.
            </p>
          </div>
          <nav className="lp-rodape-nav">
            <Link href="/blog">Blog</Link>
            <Link href="/login">Entrar</Link>
            <Link href="/login">Criar conta</Link>
          </nav>
        </div>
        <div className="container lp-rodape-copy texto-suave">
          © {new Date().getFullYear()} Licitaplus
        </div>
      </footer>
    </>
  );
}
