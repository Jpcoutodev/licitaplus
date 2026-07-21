import Link from "next/link";
import {
  CtaTeste,
  Destaque,
  Faq,
  Resposta,
} from "@/app/blog/componentes";
import type { Artigo } from "@/lib/blog/tipos";

const faq = [
  {
    p: "Onde encontro licitações abertas de graça?",
    r: "As licitações abertas são publicadas gratuitamente nos portais oficiais do governo, como o Portal Nacional de Contratações Públicas (PNCP) e o Compras.gov.br. O acesso à consulta é livre; você só precisa se cadastrar para participar de um pregão específico.",
  },
  {
    p: "Existe um site único com todas as licitações do Brasil?",
    r: "O PNCP concentra as contratações regidas pela Lei 14.133/2021 de órgãos de todo o país, sendo o ponto mais próximo de uma fonte única. Ainda assim, muitos estados e empresas públicas usam plataformas próprias, então nenhum site sozinho tem 100% de tudo.",
  },
  {
    p: "Como recebo aviso quando sair uma licitação do meu ramo?",
    r: "Os portais oficiais não enviam alertas por palavra-chave. Para ser avisado automaticamente, use um serviço de monitoramento como o SentinelaGov, que cruza as novas licitações com o seu perfil e manda um email quando aparece algo compatível.",
  },
  {
    p: "Preciso pagar para acompanhar licitações?",
    r: "Consultar os portais oficiais é gratuito. O que costuma ser pago é a conveniência: ferramentas que filtram, alertam e resumem as oportunidades para você não precisar garimpar vários sites todos os dias. O SentinelaGov oferece isso com teste grátis de 14 dias.",
  },
  {
    p: "Empresa pequena ou MEI pode participar de licitações?",
    r: "Sim. A maioria das compras públicas é de bens e serviços comuns, e a Lei Complementar 123/2006 dá vantagens a ME, EPP e MEI, como o empate ficto. O desafio não é poder participar — é encontrar a licitação certa a tempo.",
  },
];

function Corpo() {
  return (
    <>
      <Resposta>
        As licitações abertas ficam nos portais oficiais gratuitos — o principal
        é o <strong>PNCP</strong> (Portal Nacional de Contratações Públicas),
        além do Compras.gov.br e de plataformas estaduais. O problema não é
        acessar: é que são vários sites, sem alerta por ramo. A forma prática de
        não perder nenhuma é usar um monitoramento que avisa você por email
        quando aparece algo do seu segmento.
      </Resposta>

      <h2>Os principais portais de licitação no Brasil</h2>
      <p>
        Toda licitação aberta é publicada em um portal oficial, de acesso
        gratuito. Estes são os mais relevantes:
      </p>

      <div className="artigo-tabela-scroll">
        <table>
          <thead>
            <tr>
              <th>Portal</th>
              <th>O que reúne</th>
              <th>Abrangência</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>PNCP</td>
              <td>
                Editais e contratações da Lei 14.133/2021 de órgãos de todo o
                país
              </td>
              <td>Nacional</td>
            </tr>
            <tr>
              <td>Compras.gov.br</td>
              <td>Compras do governo federal (antigo ComprasNet)</td>
              <td>Federal</td>
            </tr>
            <tr>
              <td>Portais estaduais e municipais</td>
              <td>Compras de estados e prefeituras que usam sistema próprio</td>
              <td>Regional</td>
            </tr>
            <tr>
              <td>Plataformas privadas homologadas</td>
              <td>
                Pregões operados por bolsas e plataformas (ex.: BLL, BNC, BBMNET)
              </td>
              <td>Varia por órgão</td>
            </tr>
          </tbody>
        </table>
      </div>

      <Destaque titulo="O que é o PNCP">
        O Portal Nacional de Contratações Públicas é o site oficial onde os
        órgãos publicam as licitações regidas pela nova Lei de Licitações
        (14.133/2021). É o ponto de partida mais completo para quem quer vender
        ao governo — mas não cobre 100% das plataformas estaduais.
      </Destaque>

      <h2>Por que acompanhar só os portais não basta</h2>
      <p>
        Consultar os sites oficiais funciona para uma busca pontual, mas vira um
        problema quando você depende disso para não perder oportunidades:
      </p>
      <ul>
        <li>
          <strong>São fontes fragmentadas.</strong> Uma mesma empresa pode
          precisar olhar o PNCP, o portal do estado e uma ou duas plataformas
          privadas — todo dia.
        </li>
        <li>
          <strong>Não existe alerta por palavra-chave.</strong> Os portais não
          te avisam quando sai uma licitação do seu ramo; você tem que ir lá e
          procurar.
        </li>
        <li>
          <strong>O volume é enorme.</strong> São milhares de editais por
          semana no país. Achar os poucos que interessam ao seu negócio no meio
          disso consome horas.
        </li>
        <li>
          <strong>Os prazos são curtos.</strong> Descobrir uma boa licitação
          um dia depois do necessário pode significar ficar de fora.
        </li>
      </ul>

      <h2>Como não perder nenhuma licitação do seu ramo</h2>
      <p>
        A solução é inverter a lógica: em vez de você procurar, as oportunidades
        certas chegam até você. É exatamente o que o SentinelaGov faz — você
        descreve uma vez o que a sua empresa vende e onde atua, e o sistema
        monitora as fontes oficiais várias vezes ao dia, cruza cada nova
        licitação com o seu perfil e envia um email quando aparece algo
        compatível, já com um resumo em linguagem simples: objeto, valor e
        prazo.
      </p>
      <p>
        Além do alerta, cada oportunidade vem com uma análise por inteligência
        artificial: você pode conversar com a IA sobre o edital — ela lê o
        documento, explica exigências de habilitação e ajuda a decidir se vale a
        pena participar.
      </p>

      <CtaTeste />

      <h2>Passo a passo para começar a receber alertas</h2>
      <ol>
        <li>
          <strong>Crie sua conta</strong> no SentinelaGov (teste grátis por 14
          dias, sem cartão).
        </li>
        <li>
          <strong>Monte seu perfil de busca:</strong> palavras-chave do que você
          vende e os estados de interesse (ou o Brasil inteiro).
        </li>
        <li>
          <strong>Receba as oportunidades por email</strong> conforme elas são
          publicadas, com resumo pronto.
        </li>
        <li>
          <strong>Analise com a IA</strong> as que interessam e prepare sua
          proposta com antecedência.
        </li>
      </ol>

      <p>
        Quer entender o processo completo de participação?{" "}
        <Link href="/login">Comece pelo teste grátis</Link> e monte seu primeiro
        perfil em menos de dois minutos.
      </p>

      <Faq itens={faq} />

      <CtaTeste
        titulo="Pare de garimpar portais"
        texto="Deixe o SentinelaGov vigiar as licitações por você e receba só o que combina com o seu negócio. 14 dias grátis."
        rotulo="Criar minha conta grátis"
      />
    </>
  );
}

const artigo: Artigo = {
  meta: {
    slug: "onde-encontrar-licitacoes-abertas",
    titulo: "Onde encontrar licitações abertas: portais oficiais e como não perder nenhuma",
    descricao:
      "Guia dos portais oficiais de licitação (PNCP, Compras.gov.br e mais) e como receber alertas automáticos das licitações abertas do seu ramo por email.",
    resumo:
      "Os portais oficiais gratuitos, por que acompanhar só eles não basta e como ser avisado automaticamente das oportunidades do seu segmento.",
    palavrasChave: [
      "licitações abertas",
      "licitações em aberto",
      "onde encontrar licitações",
      "site de licitações",
      "portal de licitações",
      "alerta licitação",
    ],
    publicadoEm: "2026-07-19",
    atualizadoEm: "2026-07-19",
    categoria: "Guia",
    leituraMin: 6,
  },
  faq,
  Corpo,
};

export default artigo;
