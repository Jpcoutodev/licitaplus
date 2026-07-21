import Link from "next/link";
import { CtaTeste, Destaque, Faq, Resposta } from "@/app/blog/componentes";
import type { Artigo } from "@/lib/blog/tipos";

const faq = [
  {
    p: "Preciso de CNPJ para vender para o governo?",
    r: "Sim. Vender para órgãos públicos exige CNPJ ativo e regular. MEI, microempresa (ME) e empresa de pequeno porte (EPP) podem participar normalmente — e ainda têm vantagens legais previstas na Lei Complementar 123/2006.",
  },
  {
    p: "Qual o primeiro passo para vender ao governo?",
    r: "Ter o CNPJ regular e as certidões negativas em dia, e depois se cadastrar nas plataformas onde acontecem os pregões. Em paralelo, defina o que você vai oferecer e comece a acompanhar as licitações do seu ramo para escolher as compatíveis.",
  },
  {
    p: "Quanto custa começar a vender para o governo?",
    r: "Participar de licitações é gratuito — não se paga para disputar. Os custos são indiretos: manter as certidões, eventualmente uma garantia de proposta em contratos maiores, e o seu tempo para encontrar e preparar as propostas. Ferramentas de monitoramento reduzem justamente esse tempo.",
  },
  {
    p: "O que é habilitação em uma licitação?",
    r: "É a fase em que o órgão confere se a sua empresa está apta a assinar o contrato: regularidade jurídica, fiscal e trabalhista (certidões), qualificação técnica (atestados) e, às vezes, capacidade econômico-financeira. Cada edital lista exatamente o que exige.",
  },
  {
    p: "Vale a pena para empresa pequena?",
    r: "Sim. O governo é o maior comprador do país e boa parte das compras é de bens e serviços comuns, em que pequenas empresas competem bem. O segredo é foco: acompanhar as licitações certas do seu segmento em vez de tentar disputar tudo.",
  },
];

function Corpo() {
  return (
    <>
      <Resposta>
        Para vender ao governo você precisa de um CNPJ regular (MEI, ME, EPP ou
        empresa maior), manter as certidões negativas em dia, cadastrar-se nas
        plataformas de compras públicas e participar das licitações compatíveis
        com o que você oferece. O passo mais trabalhoso é encontrar as
        oportunidades certas a tempo — e é aí que um monitoramento automático
        faz diferença.
      </Resposta>

      <h2>O que significa vender para o governo</h2>
      <p>
        Órgãos públicos — prefeituras, governos estaduais, ministérios, câmaras,
        autarquias, hospitais e empresas públicas — compram praticamente de
        tudo: material de escritório, alimentos, uniformes, equipamentos de
        informática, serviços de limpeza, manutenção, software, obras. Por lei,
        essas compras precisam ser feitas por meio de <strong>licitação</strong>
        , um processo público em que empresas disputam em condições iguais.
      </p>
      <p>
        Vender ao governo, portanto, é participar dessas disputas e vencer. A
        boa notícia: é um mercado gigante, com pagamento previsível e sem
        depender de propaganda. A má notícia: as oportunidades ficam espalhadas
        em vários portais e os prazos são curtos — por isso muita gente perde
        licitações que poderia ganhar.
      </p>

      <h2>Quem pode vender para o governo</h2>
      <p>
        Qualquer empresa com CNPJ regular pode participar. E o porte pequeno é
        uma vantagem, não um obstáculo:
      </p>
      <ul>
        <li>
          <strong>MEI</strong> — pode participar, respeitando o limite de
          faturamento e o objeto da atividade.
        </li>
        <li>
          <strong>ME e EPP</strong> — têm benefícios legais (LC 123/2006), como
          o empate ficto e prazos especiais para regularizar documentação.
        </li>
        <li>
          <strong>Demais empresas</strong> — participam normalmente das
          modalidades abertas.
        </li>
      </ul>

      <Destaque titulo="Vantagem de ser pequeno">
        Na Lei Complementar 123/2006, ME e EPP contam com o <em>empate ficto</em>
        : se a sua proposta for até 5% maior que a da empresa vencedora (não
        enquadrada como pequena), você tem a chance de cobrir o lance e vencer.
        Há ainda licitações e cotas exclusivas para pequenas empresas.
      </Destaque>

      <h2>Passo a passo para começar</h2>
      <ol>
        <li>
          <strong>Regularize o CNPJ e as certidões.</strong> Tenha em dia as
          certidões negativas federal, estadual, municipal, FGTS e trabalhista.
          Elas são exigidas na habilitação.
        </li>
        <li>
          <strong>Defina o que vai oferecer.</strong> Liste seus produtos e
          serviços com clareza — é isso que vai casar com os objetos das
          licitações.
        </li>
        <li>
          <strong>Cadastre-se nas plataformas.</strong> Boa parte dos pregões é
          eletrônica e acontece em plataformas específicas; cadastre-se naquelas
          usadas pelos órgãos que você quer atender.
        </li>
        <li>
          <strong>Encontre as licitações certas.</strong> Acompanhe as
          oportunidades do seu ramo e selecione as compatíveis com o seu porte e
          a sua região.
        </li>
        <li>
          <strong>Leia o edital e prepare a proposta.</strong> Confira objeto,
          exigências de habilitação, prazos e valor de referência antes de
          disputar.
        </li>
        <li>
          <strong>Participe da sessão e dê seus lances.</strong> No pregão
          eletrônico, a disputa acontece online, em dia e hora marcados.
        </li>
      </ol>

      <h2>Onde estão as oportunidades (a parte difícil)</h2>
      <p>
        Os passos 1 a 3 você faz uma vez. O passo 4 — encontrar as licitações
        certas — é o que se repete todo dia e consome mais tempo: são milhares
        de editais publicados por semana, espalhados em portais diferentes, sem
        aviso quando surge algo do seu ramo.
      </p>
      <p>
        É exatamente esse trabalho que o <strong>SentinelaGov</strong> automatiza.
        Você descreve uma vez o que vende e onde atua, e passa a receber por
        email as licitações compatíveis com o seu perfil, já com um resumo em
        linguagem simples — objeto, valor e prazo. E pode conversar com uma IA
        sobre cada edital para decidir se vale a pena participar.
      </p>

      <CtaTeste />

      <h2>Documentos e habilitação</h2>
      <p>
        Cada edital lista o que exige, mas o conjunto costuma incluir:
      </p>
      <ul>
        <li>
          <strong>Habilitação jurídica:</strong> contrato social/CNPJ,
          documentos dos sócios.
        </li>
        <li>
          <strong>Regularidade fiscal e trabalhista:</strong> certidões
          negativas (federal, estadual, municipal, FGTS, trabalhista).
        </li>
        <li>
          <strong>Qualificação técnica:</strong> atestados de que você já
          prestou serviço/entregou produto parecido.
        </li>
        <li>
          <strong>Qualificação econômico-financeira:</strong> em contratos
          maiores, balanço e índices contábeis.
        </li>
        <li>
          <strong>Declarações:</strong> de que não emprega menor, de
          enquadramento como ME/EPP, entre outras.
        </li>
      </ul>

      <h2>Erros comuns de quem está começando</h2>
      <ul>
        <li>Tentar disputar tudo, em vez de focar no que domina.</li>
        <li>Descobrir a licitação tarde e não ter tempo de preparar a proposta.</li>
        <li>Deixar uma certidão vencer e ser inabilitado por documentação.</li>
        <li>Não ler o edital inteiro e errar exigências técnicas ou de proposta.</li>
      </ul>
      <p>
        Os dois primeiros — foco e tempo — se resolvem com monitoramento: em vez
        de garimpar, você recebe só o que interessa e sobra tempo para caprichar
        na proposta.{" "}
        <Link href="/blog/como-participar-de-licitacao-mei-pequena-empresa">
          Veja também o passo a passo para participar sendo MEI ou pequena
          empresa
        </Link>
        .
      </p>

      <Faq itens={faq} />

      <CtaTeste
        titulo="Comece a vender para o governo sem perder tempo"
        texto="O SentinelaGov encontra as licitações certas para a sua empresa e avisa por email. Teste grátis por 14 dias, sem cartão."
        rotulo="Criar minha conta grátis"
      />
    </>
  );
}

const artigo: Artigo = {
  meta: {
    slug: "como-vender-para-o-governo",
    titulo: "Como vender para o governo: guia para pequenas empresas (2026)",
    descricao:
      "Guia completo para vender ao governo: quem pode participar, passo a passo, documentos de habilitação e como encontrar as licitações certas para a sua empresa.",
    resumo:
      "Quem pode vender, o passo a passo, os documentos de habilitação e como achar as licitações certas — um guia direto para quem quer começar.",
    palavrasChave: [
      "como vender para o governo",
      "como vender pro governo",
      "como participar de licitações do governo",
      "vender para o governo sendo MEI",
      "licitações para empresas",
    ],
    publicadoEm: "2026-07-19",
    atualizadoEm: "2026-07-19",
    categoria: "Guia",
    leituraMin: 9,
  },
  faq,
  Corpo,
};

export default artigo;
