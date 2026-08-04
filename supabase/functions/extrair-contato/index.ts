/**
 * Extrai contatos de uma página web (ferramenta interna de prospecção).
 *
 * Divisão de trabalho deliberada:
 *   - a REGEX acha os candidatos (email, telefone, link de WhatsApp). Isso é
 *     determinístico: só sai o que está literalmente na página.
 *   - a IA apenas ESCOLHE entre esses candidatos qual é o contato comercial
 *     principal e identifica o responsável.
 *
 * A IA nunca inventa um número porque nunca é ela quem produz o número —
 * perguntar "qual o WhatsApp dessa empresa?" a um modelo sem acesso à web
 * devolve um telefone plausível e falso, e na prospecção isso significa ligar
 * para um estranho.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { conversarComIA } from "../_shared/ia/minimax.ts";
import { fetchWithRetry } from "../_shared/http.ts";
import { CABECALHOS_CORS, respostaPreflight } from "../_shared/cors.ts";

/** Teto do download da página. */
const MAX_BYTES = 2_000_000;
/** Texto enviado à IA depois de limpar o HTML. */
const MAX_TEXTO = 24_000;

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CABECALHOS_CORS, "Content-Type": "application/json" },
  });
}

/**
 * Recusa endereços que apontam para dentro da infraestrutura.
 *
 * Sem isso, um endpoint que busca URL arbitrária vira porta de entrada para
 * a rede interna do Supabase (SSRF) — daria para ler serviços de metadados
 * da nuvem só passando o endereço certo aqui.
 */
function urlPermitida(bruta: string): { ok: true; url: URL } | { ok: false; motivo: string } {
  let url: URL;
  try {
    url = new URL(bruta);
  } catch {
    return { ok: false, motivo: "endereço inválido" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, motivo: "só http e https são aceitos" };
  }

  const host = url.hostname.toLowerCase();
  const interno = host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "[::1]" ||
    host.startsWith("[fc") ||
    host.startsWith("[fd");
  if (interno) return { ok: false, motivo: "endereço interno não permitido" };

  return { ok: true, url };
}

/** Lê o claim `role` do JWT. Só para distinguir chamada de servidor de
 *  chamada de navegador — a validade do token quem confere é a plataforma. */
function ehServiceRole(jwt: string): boolean {
  try {
    const [, payload] = jwt.split(".");
    const dados = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return dados?.role === "service_role";
  } catch {
    return false;
  }
}

/** HTML para texto legível, preservando o que costuma ter contato. */
function htmlParaTexto(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface Candidatos {
  emails: string[];
  telefones: string[];
  whatsapps: string[];
}

/** Acha os candidatos no HTML bruto (links contam) e no texto limpo. */
function acharCandidatos(html: string, texto: string): Candidatos {
  const emails = [
    ...new Set(
      (texto.match(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/g) ?? [])
        .map((e) => e.toLowerCase())
        // Emails de imagem/asset e placeholders comuns só poluem.
        .filter((e) => !/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(e))
        .filter((e) => !/^(exemplo|example|seu|your|nome)@/i.test(e)),
    ),
  ].slice(0, 20);

  // wa.me e api.whatsapp.com aparecem como link, não como texto.
  const whatsapps = [
    ...new Set(
      (html.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)(\d{10,15})/gi) ??
        [])
        .map((m) => m.replace(/\D/g, "")),
    ),
  ].slice(0, 10);

  // Telefone brasileiro com DDD, com ou sem máscara.
  const comDdd = (texto.match(/\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}/g) ?? [])
    .map((t) => t.replace(/\D/g, ""))
    .filter((t) => t.length === 10 || t.length === 11);

  // 0800 e números curtos nacionais (4003-0015, 3003-…). São contato comercial
  // legítimo e não têm DDD, então escapavam do padrão acima — descoberto
  // testando numa página que os anunciava e a IA teve de ignorar.
  const especiais = [
    // 0800 vem agrupado de todo jeito ("0800 70 98 100", "0800 709 8100"),
    // então capturamos solto e validamos pelo total de dígitos.
    ...(texto.match(/0800(?:[\s.-]?\d){7,8}/g) ?? []),
    ...(texto.match(
      /(?:3003|4003|4004|4007|4020|4062|4090)[\s.-]?\d{4}/g,
    ) ?? []),
  ]
    .map((t) => t.replace(/\D/g, ""))
    .filter((t) => t.length === 8 || t.length === 11 || t.length === 12);

  const telefones = [...new Set([...comDdd, ...especiais])].slice(0, 20);

  return { emails, telefones, whatsapps };
}

const INSTRUCAO = `Você recebe candidatos de contato extraídos de uma página web
de uma empresa, e um trecho do texto da página.

Sua tarefa é ESCOLHER, entre os candidatos, o contato comercial principal.

REGRAS ABSOLUTAS:
- Use SOMENTE valores que aparecem nas listas de candidatos. NUNCA escreva um
  email ou telefone que não esteja lá.
- Se não houver candidato adequado, devolva null naquele campo.
- Prefira contato comercial/vendas a contato de RH, jurídico ou imprensa.
- "responsavel" só se o texto disser claramente o nome de uma pessoa de
  contato; caso contrário null.

Responda APENAS com JSON, sem cercas de código, neste formato:
{"email": string|null, "telefone": string|null, "whatsapp": string|null, "responsavel": string|null, "observacao": string|null}

Em "observacao", uma frase curta sobre o que encontrou (ex.: "contato de vendas
no rodapé"). Sem inventar nada.`;

Deno.serve(async (req) => {
  const preflight = respostaPreflight(req);
  if (preflight) return preflight;

  try {
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Só admin: a ferramenta é interna e busca URL arbitrária. A service role
    // também passa — ela já pode tudo no projeto, então exigir dela um usuário
    // admin não protegeria nada e só impediria uso operacional.
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!jwt) return json({ erro: "não autenticado" }, 401);

    if (!ehServiceRole(jwt)) {
      const { data: { user } } = await service.auth.getUser(jwt);
      if (!user?.email) return json({ erro: "não autenticado" }, 401);
      const { data: admin } = await service
        .from("admins")
        .select("email")
        .eq("email", user.email)
        .maybeSingle();
      if (!admin) return json({ erro: "acesso restrito" }, 403);
    }

    const corpo = await req.json().catch(() => ({})) as { url?: string };
    const permitida = urlPermitida(String(corpo.url ?? "").trim());
    if (!permitida.ok) return json({ erro: permitida.motivo }, 400);

    // Baixa a página.
    let html: string;
    try {
      const resposta = await fetchWithRetry(permitida.url, {
        headers: { "User-Agent": "SentinelaGov/1.0 (prospeccao interna)" },
      }, { timeoutMs: 15_000, tentativas: 2 });
      if (!resposta.ok) {
        return json({ erro: `a página respondeu HTTP ${resposta.status}` }, 200);
      }
      const bytes = new Uint8Array(await resposta.arrayBuffer());
      if (bytes.length > MAX_BYTES) {
        return json({ erro: "página grande demais para analisar" }, 200);
      }
      html = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } catch (erro) {
      return json(
        {
          erro: `não deu para abrir a página: ${
            erro instanceof Error ? erro.message : String(erro)
          }`,
        },
        200,
      );
    }

    const texto = htmlParaTexto(html);
    const candidatos = acharCandidatos(html, texto);

    if (
      candidatos.emails.length === 0 &&
      candidatos.telefones.length === 0 &&
      candidatos.whatsapps.length === 0
    ) {
      return json({
        encontrou: false,
        erro:
          "nenhum email, telefone ou WhatsApp na página — talvez o contato esteja em outra (procure /contato) ou dentro de imagem",
        candidatos,
      });
    }

    // A IA só escolhe entre o que a regex achou.
    let escolha: Record<string, string | null> = {};
    try {
      const resposta = await conversarComIA([
        { role: "system", content: INSTRUCAO },
        {
          role: "user",
          content: `Candidatos encontrados na página:\n` +
            `emails: ${JSON.stringify(candidatos.emails)}\n` +
            `telefones: ${JSON.stringify(candidatos.telefones)}\n` +
            `whatsapps: ${JSON.stringify(candidatos.whatsapps)}\n\n` +
            `Trecho da página:\n${texto.slice(0, MAX_TEXTO)}`,
        },
      ], 600);
      escolha = JSON.parse(
        resposta.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim(),
      );
    } catch {
      // IA indisponível ou resposta fora do formato: entrega o primeiro
      // candidato de cada tipo. Melhor um palpite honesto que erro na tela.
      escolha = {
        email: candidatos.emails[0] ?? null,
        telefone: candidatos.telefones[0] ?? null,
        whatsapp: candidatos.whatsapps[0] ?? null,
        responsavel: null,
        observacao: "escolha automática (IA indisponível)",
      };
    }

    // Trava final: descarta qualquer valor que não esteja nos candidatos.
    const dentro = (v: string | null, lista: string[]) =>
      v && lista.some((c) => c.replace(/\D/g, "") === v.replace(/\D/g, "") || c === v)
        ? v
        : null;

    const resultado = {
      encontrou: true,
      email: dentro(escolha.email ?? null, candidatos.emails),
      telefone: dentro(escolha.telefone ?? null, [
        ...candidatos.telefones,
        ...candidatos.whatsapps,
      ]),
      whatsapp: dentro(escolha.whatsapp ?? null, [
        ...candidatos.whatsapps,
        ...candidatos.telefones,
      ]),
      responsavel: escolha.responsavel ?? null,
      observacao: escolha.observacao ?? null,
      candidatos,
    };

    console.log(JSON.stringify({
      funcao: "extrair-contato",
      host: permitida.url.hostname,
      emails: candidatos.emails.length,
      telefones: candidatos.telefones.length,
    }));
    return json(resultado);
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error(JSON.stringify({ funcao: "extrair-contato", erro: mensagem }));
    return json({ erro: mensagem }, 500);
  }
});
