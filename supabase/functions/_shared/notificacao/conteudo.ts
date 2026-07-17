/**
 * Conteúdo da notificação (prompt do resumo e corpo do email) — lógica pura,
 * sem IO, testável em Node ou Deno. O resumo usa APENAS os campos
 * estruturados já persistidos; nada de PDF/OCR.
 */

export interface LicitacaoParaNotificar {
  objeto_compra: string;
  informacao_complementar: string | null;
  valor_total_estimado: number | null;
  data_abertura_proposta: string | null;
  data_encerramento_proposta: string | null;
  orgao_razao_social: string | null;
  unidade_nome: string | null;
  uf: string | null;
  municipio_nome: string | null;
  modalidade_nome: string | null;
  link_sistema_origem: string | null;
  numero_controle_pncp: string;
}

export function formatarValor(valor: number | null): string {
  if (valor === null) return "não informado";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarData(data: string | null): string {
  if (!data) return "não informada";
  const d = new Date(data);
  if (Number.isNaN(d.getTime())) return "não informada";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const INSTRUCAO_RESUMO =
  "Você escreve resumos de licitações públicas para donos de pequenas empresas " +
  "que não conhecem o jargão de licitações. Escreva em português simples e " +
  "direto, em 2 ou 3 frases: o que está sendo comprado, quem está comprando, " +
  "o valor estimado e até quando dá para enviar proposta. Use somente as " +
  "informações fornecidas — nunca invente nada. Responda apenas com o resumo, " +
  "sem título nem comentários.";

export function montarPromptResumo(l: LicitacaoParaNotificar): string {
  const linhas = [
    `Objeto: ${l.objeto_compra}`,
    l.informacao_complementar
      ? `Informação complementar: ${l.informacao_complementar.slice(0, 800)}`
      : null,
    `Valor total estimado: ${formatarValor(l.valor_total_estimado)}`,
    `Abertura das propostas: ${formatarData(l.data_abertura_proposta)}`,
    `Encerramento das propostas: ${formatarData(l.data_encerramento_proposta)}`,
    `Órgão: ${l.orgao_razao_social ?? "não informado"}`,
    `Unidade: ${l.unidade_nome ?? "não informada"}`,
    `Local: ${l.municipio_nome ?? "?"}/${l.uf ?? "?"}`,
    `Modalidade: ${l.modalidade_nome ?? "não informada"}`,
  ];
  return linhas.filter(Boolean).join("\n");
}

export interface ItemEmail {
  licitacao: LicitacaoParaNotificar;
  resumo: string;
}

function escaparHtml(texto: string): string {
  return texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function montarEmailMatches(itens: ItemEmail[]): {
  assunto: string;
  html: string;
} {
  const assunto = itens.length === 1
    ? "Licitaplus: 1 nova licitação para o seu perfil"
    : `Licitaplus: ${itens.length} novas licitações para o seu perfil`;

  const blocos = itens.map(({ licitacao: l, resumo }) => {
    const titulo = escaparHtml(l.objeto_compra.slice(0, 140));
    const link = l.link_sistema_origem?.startsWith("http")
      ? `<p><a href="${escaparHtml(l.link_sistema_origem)}">Ver licitação no sistema de origem</a></p>`
      : "";
    return `
      <div style="border:1px solid #ddd;border-radius:8px;padding:16px;margin-bottom:16px;">
        <h3 style="margin:0 0 8px 0;">${titulo}</h3>
        <p style="margin:0 0 8px 0;">${escaparHtml(resumo)}</p>
        <p style="margin:0;color:#555;font-size:14px;">
          <strong>Valor estimado:</strong> ${escaparHtml(formatarValor(l.valor_total_estimado))}<br>
          <strong>Propostas até:</strong> ${escaparHtml(formatarData(l.data_encerramento_proposta))}<br>
          <strong>Órgão:</strong> ${escaparHtml(l.orgao_razao_social ?? "não informado")} — ${escaparHtml(l.municipio_nome ?? "?")}/${escaparHtml(l.uf ?? "?")}<br>
          <strong>Controle PNCP:</strong> ${escaparHtml(l.numero_controle_pncp)}
        </p>
        ${link}
      </div>`;
  });

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;">
      <h2>Novas licitações para o seu perfil</h2>
      <p>Encontramos oportunidades no PNCP compatíveis com as palavras-chave do seu perfil:</p>
      ${blocos.join("\n")}
      <p style="color:#888;font-size:12px;">Você recebe este email porque tem um perfil ativo no Licitaplus.</p>
    </div>`;

  return { assunto, html };
}
