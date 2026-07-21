import Link from "next/link";
import { CtaTeste, Destaque, Faq, Resposta } from "@/app/blog/componentes";
import type { Artigo } from "@/lib/blog/tipos";

const faq = [
  {
    p: "MEI pode participar de licitação?",
    r: "Pode. O MEI participa de licitações desde que o objeto esteja dentro das suas atividades permitidas e do limite de faturamento. Em compras de menor valor e em cotas exclusivas para pequenos, o MEI costuma competir muito bem.",
  },
  {
    p: "Preciso contratar uma assessoria para participar?",
    r: "Não é obrigatório. Assessorias ajudam em contratos complexos, mas para a maioria dos pregões de bens e serviços comuns uma pequena empresa consegue participar sozinha — o essencial é manter a documentação em dia e ler bem o edital. Ferramentas com IA ajudam a entender as exigências sem custo de consultoria.",
  },
  {
    p: "Quais as vantagens de ME e EPP nas licitações?",
    r: "A Lei Complementar 123/2006 garante o empate ficto (chance de cobrir uma proposta até 5% menor), prazo para regularizar a documentação fiscal depois de vencer, além de cotas e licitações exclusivas para pequenas empresas em determinados valores.",
  },
  {
    p: "O que preciso para dar meu primeiro lance?",
    r: "Estar cadastrado na plataforma do pregão, ter enviado sua proposta inicial dentro do prazo do edital e acompanhar a sessão no dia e hora marcados. A disputa de lances acontece de forma eletrônica, pelo próprio sistema.",
  },
  {
    p: "Como sei quais licitações combinam com a minha empresa?",
    r: "Definindo palavras-chave do que você vende e a sua região, e filtrando as oportunidades por elas. O SentinelaGov faz esse cruzamento automaticamente e envia por email só as licitações compatíveis com o seu perfil.",
  },
];

function Corpo() {
  return (
    <>
      <Resposta>
        Sim, MEI e pequenas empresas podem participar de licitações — e ainda
        têm vantagens legais (Lei Complementar 123/2006), como o empate ficto e
        cotas exclusivas. Para participar, mantenha o CNPJ e as certidões em dia,
        cadastre-se na plataforma do pregão, envie a proposta e dispute os
        lances. Não é preciso ser especialista: o essencial é escolher as
        licitações certas e ler bem o edital.
      </Resposta>

      <h2>MEI e pequena empresa podem participar?</h2>
      <p>
        Podem, e são incentivados por lei. O governo trata micro e pequenas
        empresas como prioridade nas compras públicas para estimular a economia
        local. Na prática, boa parte das licitações é de bens e serviços comuns
        — o terreno em que empresas menores competem de igual para igual, e
        muitas vezes com vantagem.
      </p>

      <Destaque titulo="As vantagens de ser ME, EPP ou MEI">
        <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
          <li>
            <strong>Empate ficto:</strong> se a sua proposta for até 5% maior
            que a da vencedora não enquadrada, você pode cobrir o lance e vencer.
          </li>
          <li>
            <strong>Regularização depois:</strong> pode corrigir pendências
            fiscais após ser declarada vencedora, num prazo dado pelo edital.
          </li>
          <li>
            <strong>Cotas e exclusividade:</strong> há itens reservados e
            licitações exclusivas para pequenas empresas em certos valores.
          </li>
        </ul>
      </Destaque>

      <h2>Passo a passo para participar</h2>
      <ol>
        <li>
          <strong>Confirme seu enquadramento.</strong> Saiba se você é MEI, ME
          ou EPP — isso define os benefícios a que tem direito.
        </li>
        <li>
          <strong>Deixe a documentação em dia.</strong> CNPJ ativo e certidões
          negativas (federal, estadual, municipal, FGTS e trabalhista).
        </li>
        <li>
          <strong>Cadastre-se na plataforma.</strong> O pregão eletrônico
          acontece em sistemas online; faça o cadastro no que o órgão utiliza.
        </li>
        <li>
          <strong>Escolha licitações compatíveis.</strong> Foque no seu ramo,
          porte e região — não tente disputar tudo.
        </li>
        <li>
          <strong>Envie a proposta inicial</strong> dentro do prazo, seguindo o
          modelo do edital.
        </li>
        <li>
          <strong>Dispute os lances</strong> na sessão pública e, se vencer,
          envie a documentação de habilitação.
        </li>
      </ol>

      <h2>Como ler um edital sem ser especialista</h2>
      <p>
        O edital assusta pelo tamanho, mas o que você precisa achar é objetivo:
        o <strong>objeto</strong> (o que estão comprando), os{" "}
        <strong>prazos</strong> (envio de proposta e sessão), o{" "}
        <strong>valor de referência</strong>, as{" "}
        <strong>exigências de habilitação</strong> e as regras da proposta.
      </p>
      <p>
        No SentinelaGov, você não precisa caçar isso sozinho: anexe o edital e
        converse com a IA — ela lê o documento, aponta as exigências de
        habilitação, os prazos e ajuda a decidir se a licitação é viável para a
        sua empresa. É como ter uma primeira leitura técnica, na hora, sem custo
        de assessoria.
      </p>

      <CtaTeste
        titulo="Deixe a IA ler o edital por você"
        texto="Receba as licitações do seu ramo e use a análise com IA para entender cada edital e decidir com segurança. Teste grátis por 14 dias."
      />

      <h2>Documentos de habilitação mais comuns</h2>
      <ul>
        <li>Contrato social ou certificado de MEI e documentos dos sócios.</li>
        <li>
          Certidões negativas: federal, estadual, municipal, FGTS e trabalhista.
        </li>
        <li>
          Atestado de capacidade técnica (quando exigido), comprovando
          experiência.
        </li>
        <li>Declaração de enquadramento como ME/EPP para usar os benefícios.</li>
        <li>Declaração de que não emprega menor, entre outras do edital.</li>
      </ul>

      <p>
        Quer o panorama completo do começo?{" "}
        <Link href="/blog/como-vender-para-o-governo">
          Leia o guia de como vender para o governo
        </Link>{" "}
        ou veja{" "}
        <Link href="/blog/onde-encontrar-licitacoes-abertas">
          onde encontrar as licitações abertas
        </Link>
        .
      </p>

      <Faq itens={faq} />

      <CtaTeste
        titulo="Sua empresa pode vender ao governo"
        texto="O SentinelaGov encontra as licitações certas e a IA ajuda a entender cada edital. Comece o teste grátis de 14 dias, sem cartão."
        rotulo="Criar minha conta grátis"
      />
    </>
  );
}

const artigo: Artigo = {
  meta: {
    slug: "como-participar-de-licitacao-mei-pequena-empresa",
    titulo: "Como participar de licitação sendo MEI ou pequena empresa: passo a passo",
    descricao:
      "MEI e pequena empresa podem participar de licitações e têm vantagens legais. Veja o passo a passo, os benefícios da LC 123 e como ler um edital sem ser especialista.",
    resumo:
      "Pode participar, tem vantagens e não precisa ser especialista: enquadramento, benefícios da LC 123, passo a passo e como entender o edital.",
    palavrasChave: [
      "como participar de licitações",
      "licitação para MEI",
      "licitação para pequena empresa",
      "MEI pode participar de licitação",
      "empresa de licitação",
    ],
    publicadoEm: "2026-07-19",
    atualizadoEm: "2026-07-19",
    categoria: "Guia",
    leituraMin: 8,
  },
  faq,
  Corpo,
};

export default artigo;
