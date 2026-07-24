import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "../logo";
import { MARCA } from "@/lib/marca";

const ATUALIZADO_EM = "24 de julho de 2026";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description:
    "Como o SentinelaGov coleta, usa, compartilha e protege seus dados pessoais, em conformidade com a LGPD (Lei nº 13.709/2018).",
  alternates: { canonical: "/privacidade" },
};

export default function PaginaPrivacidade() {
  return (
    <div className="artigo">
      <p style={{ marginBottom: 24 }}>
        <Link href="/" aria-label="SentinelaGov">
          <Logo />
        </Link>
      </p>

      <h1 className="artigo-titulo">Política de Privacidade</h1>
      <p className="artigo-meta texto-suave">
        Última atualização: {ATUALIZADO_EM}
      </p>

      <div className="artigo-corpo">
        <p>
          Esta Política de Privacidade explica como o <strong>{MARCA.nome}</strong>{" "}
          coleta, utiliza, compartilha, armazena e protege os seus dados
          pessoais, em conformidade com a{" "}
          <strong>Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018)</strong>{" "}
          e demais normas aplicáveis. Ao criar uma conta ou utilizar o serviço,
          você declara ter lido e compreendido esta Política.
        </p>

        <h2>1. Quem é o controlador dos dados</h2>
        <p>
          O {MARCA.nome} é operado por <strong>[Razão Social da empresa]</strong>,
          inscrita no CNPJ sob o nº <strong>[preencher CNPJ]</strong>, com sede em{" "}
          <strong>[endereço]</strong> (&quot;nós&quot;, &quot;nosso&quot;), na
          qualidade de <strong>controladora</strong> dos dados pessoais tratados
          por meio da plataforma disponível em {MARCA.dominio}.
        </p>
        <p>
          <strong>Encarregado pelo Tratamento de Dados (DPO):</strong>{" "}
          [nome do Encarregado] — contato:{" "}
          <a href="mailto:privacidade@sentinelagov.com">
            privacidade@sentinelagov.com
          </a>
          .
        </p>

        <h2>2. Dados pessoais que coletamos</h2>
        <h3>2.1. Dados que você nos fornece</h3>
        <ul>
          <li>
            <strong>Cadastro:</strong> endereço de e-mail e senha (a senha é
            armazenada de forma cifrada pelo nosso provedor de autenticação —
            não temos acesso a ela em texto legível).
          </li>
          <li>
            <strong>Dados da empresa (onboarding):</strong> nome da empresa,
            telefone e <strong>CPF ou CNPJ</strong>.
          </li>
          <li>
            <strong>Perfil de busca:</strong> palavras-chave, estados e
            modalidades de interesse que você configura.
          </li>
          <li>
            <strong>Conteúdo de uso:</strong> licitações favoritadas, mensagens
            que você troca com a inteligência artificial e{" "}
            <strong>documentos que você anexa</strong> (editais e anexos que você
            carrega ou seleciona do PNCP para análise).
          </li>
          <li>
            <strong>Suporte:</strong> chamados abertos e mensagens trocadas com o
            atendimento.
          </li>
        </ul>

        <h3>2.2. Dados coletados automaticamente</h3>
        <ul>
          <li>
            <strong>Dados de navegação e uso:</strong> páginas visitadas, origem
            do acesso (referer), identificador de sessão, data e hora.
          </li>
          <li>
            <strong>Telemetria da análise com IA:</strong> tipo de ação (ex.:
            anexar documento, gerar resumo), sucesso ou erro, e tempo de
            processamento — para monitorar a qualidade do serviço.
          </li>
          <li>
            <strong>Dados técnicos:</strong> tipo de dispositivo, navegador e
            informações necessárias ao funcionamento seguro da plataforma.
          </li>
          <li>
            <strong>Notificações push:</strong> caso você as ative, o endereço
            técnico de inscrição (endpoint) fornecido pelo seu navegador.
          </li>
        </ul>

        <h3>2.3. Dados de pagamento</h3>
        <p>
          Os pagamentos são processados diretamente pela <strong>Stripe</strong>.{" "}
          <strong>Não coletamos nem armazenamos os dados do seu cartão.</strong>{" "}
          Recebemos e guardamos apenas identificadores da assinatura (código de
          cliente e de assinatura na Stripe) e o plano contratado.
        </p>

        <h3>2.4. Dados públicos de licitações</h3>
        <p>
          As informações de licitações exibidas provêm do{" "}
          <strong>PNCP (Portal Nacional de Contratações Públicas)</strong>, base
          pública oficial. Esses dados são públicos e não constituem dados
          pessoais seus.
        </p>

        <h2>3. Para que usamos seus dados e com qual base legal</h2>
        <p>
          Tratamos seus dados pessoais apenas para finalidades legítimas, com
          fundamento nas bases legais da LGPD (art. 7º):
        </p>
        <div className="artigo-tabela-scroll">
          <table>
            <thead>
              <tr>
                <th>Finalidade</th>
                <th>Base legal (LGPD)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  Criar e manter sua conta, executar o monitoramento de
                  licitações, enviar alertas e oferecer a análise com IA
                </td>
                <td>Execução de contrato (art. 7º, V)</td>
              </tr>
              <tr>
                <td>Processar pagamentos e gerir a assinatura</td>
                <td>
                  Execução de contrato e cumprimento de obrigação legal/fiscal
                  (art. 7º, V e II)
                </td>
              </tr>
              <tr>
                <td>
                  Usar o CPF/CNPJ para identificar a empresa e impedir a criação
                  de múltiplas contas para burlar o teste grátis
                </td>
                <td>Legítimo interesse (art. 7º, IX)</td>
              </tr>
              <tr>
                <td>Prestar suporte e responder solicitações</td>
                <td>Execução de contrato / legítimo interesse</td>
              </tr>
              <tr>
                <td>
                  Medir uso, prevenir fraudes e abusos e melhorar a segurança e a
                  qualidade do produto
                </td>
                <td>Legítimo interesse (art. 7º, IX)</td>
              </tr>
              <tr>
                <td>Cumprir obrigações legais e regulatórias</td>
                <td>Obrigação legal (art. 7º, II)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Quando o tratamento se apoiar em legítimo interesse, avaliamos que ele
          não se sobrepõe aos seus direitos e liberdades fundamentais. Você pode
          se opor a esse tratamento a qualquer momento (ver seção 8).
        </p>

        <h2>4. Compartilhamento e operadores (suboperadores)</h2>
        <p>
          <strong>Não vendemos seus dados pessoais.</strong> Para operar o
          serviço, compartilhamos dados estritamente necessários com prestadores
          que atuam como operadores, obrigados contratualmente a protegê-los:
        </p>
        <ul>
          <li>
            <strong>Supabase</strong> — banco de dados, autenticação e funções de
            servidor (dados hospedados em infraestrutura na região do Brasil).
          </li>
          <li>
            <strong>Vercel</strong> — hospedagem e entrega do site e do
            aplicativo.
          </li>
          <li>
            <strong>MiniMax</strong> — provedor de inteligência artificial que
            processa o texto das suas perguntas e{" "}
            <strong>dos documentos que você envia para análise</strong>. Trata-se
            de provedor sediado no exterior (ver seção 6).
          </li>
          <li>
            <strong>Resend</strong> — envio dos e-mails de alerta e de sistema.
          </li>
          <li>
            <strong>Stripe</strong> — processamento de pagamentos (provedor
            internacional).
          </li>
        </ul>
        <p>
          Poderemos ainda compartilhar dados para cumprir ordem judicial,
          requisição de autoridade competente ou obrigação legal, e em caso de
          reorganização societária, sempre observando esta Política.
        </p>

        <h2>5. Cookies e tecnologias semelhantes</h2>
        <p>
          Utilizamos cookies e armazenamento local <strong>essenciais</strong>{" "}
          para autenticar sua sessão e manter o funcionamento da plataforma, além
          de medição de uso <strong>própria</strong> (analytics de primeira
          parte) para entender e melhorar o serviço.{" "}
          <strong>Não utilizamos cookies de publicidade de terceiros.</strong>{" "}
          Você pode gerenciar cookies nas configurações do seu navegador, ciente
          de que desativar os essenciais pode impedir o login.
        </p>

        <h2>6. Transferência internacional de dados</h2>
        <p>
          Alguns operadores (como <strong>MiniMax</strong> e{" "}
          <strong>Stripe</strong>) podem tratar dados fora do Brasil. Nesses
          casos, adotamos salvaguardas para garantir proteção adequada, conforme
          o art. 33 da LGPD. Em especial, ao anexar um documento ou enviar uma
          pergunta à IA, o respectivo conteúdo é processado por provedor de IA
          sediado no exterior. Evite inserir na conversa dados pessoais sensíveis
          que não sejam necessários à análise da licitação.
        </p>

        <h2>7. Por quanto tempo guardamos seus dados</h2>
        <p>
          Mantemos seus dados enquanto sua conta estiver ativa e pelo tempo
          necessário às finalidades desta Política. Adotamos, ainda, prazos
          automáticos de limpeza, entre eles:
        </p>
        <ul>
          <li>
            texto de documentos anexados: descartado após{" "}
            <strong>60 dias</strong> de inatividade da conversa (as mensagens são
            mantidas);
          </li>
          <li>
            conversas de IA inativas: excluídas após <strong>6 meses</strong>;
          </li>
          <li>
            registros de navegação e telemetria: <strong>90 dias</strong>;
          </li>
          <li>
            licitações encerradas há mais de <strong>90 dias</strong> e não
            favoritadas: removidas.
          </li>
        </ul>
        <p>
          Dados necessários ao cumprimento de obrigações legais (por exemplo,
          fiscais e contábeis relativos a pagamentos) são mantidos pelos prazos
          exigidos por lei, ainda que você encerre a conta.
        </p>

        <h2>8. Seus direitos como titular</h2>
        <p>
          Nos termos do art. 18 da LGPD, você pode, a qualquer momento e
          gratuitamente:
        </p>
        <ul>
          <li>confirmar a existência de tratamento e acessar seus dados;</li>
          <li>corrigir dados incompletos, inexatos ou desatualizados;</li>
          <li>
            solicitar anonimização, bloqueio ou eliminação de dados
            desnecessários ou tratados em desconformidade;
          </li>
          <li>solicitar a portabilidade dos dados;</li>
          <li>
            obter informação sobre com quem compartilhamos seus dados;
          </li>
          <li>
            revogar o consentimento e se opor a tratamentos baseados em legítimo
            interesse;
          </li>
          <li>solicitar a eliminação dos dados tratados com base no consentimento.</li>
        </ul>
        <p>
          Para exercer seus direitos, escreva para{" "}
          <a href="mailto:privacidade@sentinelagov.com">
            privacidade@sentinelagov.com
          </a>
          . Responderemos nos prazos previstos em lei. Você também pode
          apresentar reclamação à{" "}
          <strong>Autoridade Nacional de Proteção de Dados (ANPD)</strong>.
        </p>

        <h2>9. Segurança da informação</h2>
        <p>
          Adotamos medidas técnicas e organizacionais para proteger seus dados,
          como criptografia em trânsito (HTTPS), controle de acesso por linha
          (cada usuário só acessa os próprios dados), autenticação e restrição de
          escrita a processos de servidor. Apesar dos nossos esforços, nenhum
          sistema é completamente imune a incidentes; caso ocorra um incidente
          relevante, seguiremos os procedimentos e prazos de comunicação
          previstos na LGPD.
        </p>

        <h2>10. Dados de crianças e adolescentes</h2>
        <p>
          O {MARCA.nome} é destinado a empresas e profissionais maiores de 18
          anos. Não coletamos intencionalmente dados de menores de idade.
        </p>

        <h2>11. Alterações desta Política</h2>
        <p>
          Podemos atualizar esta Política periodicamente. Alterações relevantes
          serão comunicadas por e-mail ou aviso na plataforma. A data de
          &quot;última atualização&quot; no topo indica a versão vigente.
        </p>

        <h2>12. Contato</h2>
        <p>
          Dúvidas sobre esta Política ou sobre o tratamento dos seus dados? Fale
          com nosso Encarregado em{" "}
          <a href="mailto:privacidade@sentinelagov.com">
            privacidade@sentinelagov.com
          </a>{" "}
          ou com o atendimento em{" "}
          <a href={`mailto:${MARCA.emailContato}`}>{MARCA.emailContato}</a>.
        </p>
      </div>

      <p style={{ marginTop: 32 }} className="texto-suave">
        <Link href="/">← Voltar ao início</Link> ·{" "}
        <Link href="/termos">Termos de Uso</Link>
      </p>
    </div>
  );
}
