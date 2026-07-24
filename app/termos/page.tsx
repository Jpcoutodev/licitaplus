import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "../logo";
import { MARCA } from "@/lib/marca";

const ATUALIZADO_EM = "24 de julho de 2026";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description:
    "Termos e condições de uso do SentinelaGov: cadastro, planos, pagamento, cancelamento, uso da inteligência artificial e responsabilidades.",
  alternates: { canonical: "/termos" },
};

export default function PaginaTermos() {
  return (
    <div className="artigo">
      <p style={{ marginBottom: 24 }}>
        <Link href="/" aria-label="SentinelaGov">
          <Logo />
        </Link>
      </p>

      <h1 className="artigo-titulo">Termos de Uso</h1>
      <p className="artigo-meta texto-suave">
        Última atualização: {ATUALIZADO_EM}
      </p>

      <div className="artigo-corpo">
        <p>
          Estes Termos de Uso (&quot;Termos&quot;) regem o acesso e o uso da
          plataforma <strong>{MARCA.nome}</strong>, disponível em{" "}
          {MARCA.dominio} (&quot;Serviço&quot;), operada por{" "}
          <strong>[Razão Social]</strong>, CNPJ <strong>[preencher]</strong>. Ao
          criar uma conta ou utilizar o Serviço, você concorda com estes Termos e
          com a{" "}
          <Link href="/privacidade">Política de Privacidade</Link>. Se não
          concordar, não utilize o Serviço.
        </p>

        <h2>1. O que é o Serviço</h2>
        <p>
          O {MARCA.nome} é uma ferramenta de <strong>apoio</strong> que monitora
          contratações públicas divulgadas no PNCP (Portal Nacional de
          Contratações Públicas), seleciona oportunidades compatíveis com o
          perfil que você configura, envia alertas e oferece recursos de análise
          com inteligência artificial (resumos, chat sobre editais e busca). O
          Serviço <strong>não</strong> participa de licitações por você, não
          elabora propostas oficiais e não substitui a leitura do edital nem a
          assessoria jurídica.
        </p>

        <h2>2. Cadastro e conta</h2>
        <ul>
          <li>
            Você deve fornecer informações verdadeiras, completas e atualizadas,
            incluindo um <strong>CPF ou CNPJ válido</strong>.
          </li>
          <li>
            É permitido <strong>um teste grátis por CPF/CNPJ</strong>. Criar
            múltiplas contas para obter novos períodos gratuitos é vedado.
          </li>
          <li>
            Você é responsável por manter a confidencialidade da sua senha e por
            toda atividade realizada na sua conta.
          </li>
          <li>Você deve ser maior de 18 anos e ter capacidade para contratar.</li>
        </ul>

        <h2>3. Planos, teste grátis e pagamento</h2>
        <ul>
          <li>
            <strong>Teste grátis:</strong> 14 dias, com 1 perfil de busca e até
            10 análises de IA no período, sem necessidade de cartão.
          </li>
          <li>
            <strong>Essencial (R$ 97/mês):</strong> 1 perfil de busca e 30
            análises de IA por mês.
          </li>
          <li>
            <strong>Profissional (R$ 197/mês):</strong> 3 perfis de busca e 100
            análises de IA por mês.
          </li>
          <li>
            Uma &quot;análise&quot; corresponde a cada documento anexado ao
            contexto de uma conversa (o resumo executivo daquele documento está
            incluído). As perguntas no chat sobre um documento já anexado não
            consomem análises, sujeitas a limites de uso justo.
          </li>
          <li>
            As assinaturas são <strong>recorrentes</strong> e cobradas pela
            Stripe, <strong>renovando-se automaticamente</strong> ao fim de cada
            ciclo até o cancelamento.
          </li>
          <li>
            Preços e limites podem ser alterados mediante aviso prévio; alterações
            não se aplicam ao ciclo já pago.
          </li>
        </ul>

        <h2>4. Cancelamento e reembolso</h2>
        <ul>
          <li>
            Você pode <strong>cancelar a qualquer momento</strong> pelo portal de
            cobrança, mantendo o acesso até o fim do período já pago. Não há
            reembolso proporcional de período em curso, salvo disposição legal em
            contrário.
          </li>
          <li>
            <strong>Direito de arrependimento:</strong> nos termos do art. 49 do
            Código de Defesa do Consumidor, se você contratou pela internet, pode
            desistir em até <strong>7 (sete) dias</strong> a contar da
            contratação, com devolução dos valores pagos.
          </li>
        </ul>

        <h2>5. Uso aceitável</h2>
        <p>Ao usar o Serviço, você concorda em não:</p>
        <ul>
          <li>
            violar leis, direitos de terceiros ou estes Termos;
          </li>
          <li>
            tentar acessar áreas ou dados de outros usuários, burlar limites de
            plano ou comprometer a segurança da plataforma;
          </li>
          <li>
            realizar coleta automatizada abusiva, engenharia reversa ou
            sobrecarregar a infraestrutura;
          </li>
          <li>
            revender, sublicenciar ou explorar comercialmente o Serviço sem nossa
            autorização;
          </li>
          <li>
            enviar conteúdo ilícito ou dados de terceiros sem base legal para
            tanto.
          </li>
        </ul>

        <h2>6. Propriedade intelectual</h2>
        <p>
          A marca {MARCA.nome}, o software, o design e os conteúdos que produzimos
          são de nossa titularidade ou licenciados, protegidos por lei. Estes
          Termos concedem a você apenas uma licença de uso pessoal e
          intransferível durante a vigência da assinatura. Os{" "}
          <strong>documentos que você envia permanecem seus</strong>; ao
          enviá-los, você nos concede licença limitada para processá-los com o
          único fim de prestar o Serviço (extração de texto, indexação e análise
          por IA).
        </p>

        <h2>7. Dados públicos e inteligência artificial</h2>
        <ul>
          <li>
            As informações de licitações vêm do <strong>PNCP</strong> e de fontes
            públicas. <strong>Não garantimos</strong> sua exatidão, completude ou
            atualização — a fonte oficial sempre prevalece.
          </li>
          <li>
            Os recursos de IA são <strong>assistivos</strong> e podem conter
            erros, imprecisões ou omissões. As respostas{" "}
            <strong>não constituem aconselhamento jurídico</strong> e não
            substituem a leitura integral do edital nem a orientação de um
            profissional habilitado.
          </li>
          <li>
            A decisão de participar (ou não) de uma licitação e a elaboração de
            propostas são de sua exclusiva responsabilidade. Confira sempre o
            edital oficial antes de decidir.
          </li>
        </ul>

        <h2>8. Isenção de garantias</h2>
        <p>
          O Serviço é fornecido &quot;no estado em que se encontra&quot;. Não
          garantimos que ele estará disponível de forma ininterrupta ou livre de
          erros, nem que você obterá qualquer resultado comercial específico
          (como vencer licitações). Empenhamo-nos para manter alta
          disponibilidade e qualidade.
        </p>

        <h2>9. Limitação de responsabilidade</h2>
        <p>
          Na máxima extensão permitida pela lei, não nos responsabilizamos por
          danos indiretos, lucros cessantes, perda de oportunidade ou decisões de
          negócio tomadas com base no Serviço. Nossa responsabilidade total,
          quando cabível, fica limitada ao valor efetivamente pago por você nos{" "}
          <strong>12 meses</strong> anteriores ao evento que originou a
          reclamação. Nada nestes Termos afasta direitos que a lei assegure ao
          consumidor.
        </p>

        <h2>10. Suspensão e encerramento</h2>
        <p>
          Podemos suspender ou encerrar o acesso em caso de violação destes
          Termos, uso fraudulento ou por exigência legal. Você pode encerrar sua
          conta quando quiser. O encerramento observa a{" "}
          <Link href="/privacidade">Política de Privacidade</Link> quanto à
          retenção e eliminação de dados.
        </p>

        <h2>11. Alterações destes Termos</h2>
        <p>
          Podemos atualizar estes Termos periodicamente. Mudanças relevantes serão
          comunicadas por e-mail ou aviso na plataforma. O uso continuado após a
          vigência das alterações implica concordância.
        </p>

        <h2>12. Lei aplicável e foro</h2>
        <p>
          Estes Termos são regidos pelas leis da República Federativa do Brasil.
          Fica eleito o foro da comarca de <strong>[cidade/UF]</strong> para
          dirimir controvérsias, sem prejuízo do foro do domicílio do consumidor
          quando aplicável.
        </p>

        <h2>13. Contato</h2>
        <p>
          Dúvidas sobre estes Termos? Fale com a gente em{" "}
          <a href={`mailto:${MARCA.emailContato}`}>{MARCA.emailContato}</a> ou
          abra um chamado dentro da plataforma.
        </p>
      </div>

      <p style={{ marginTop: 32 }} className="texto-suave">
        <Link href="/">← Voltar ao início</Link> ·{" "}
        <Link href="/privacidade">Política de Privacidade</Link>
      </p>
    </div>
  );
}
