"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { criarClientNavegador } from "@/lib/supabase/client";

interface OpcaoFavorita {
  licitacao_id: string;
  rotulo: string;
}

interface MensagemChat {
  role: "user" | "assistant";
  content: string;
}

interface DocumentoAnexado {
  nome: string;
  texto: string;
  truncado: boolean;
  paginas: number;
}

/** PDF até ~6 MB (o texto extraído é limitado no servidor). */
const MAX_BYTES_PDF = 6 * 1024 * 1024;

export default function PaginaAnalise() {
  return (
    <Suspense fallback={<p className="texto-suave">Carregando...</p>}>
      <ChatAnalise />
    </Suspense>
  );
}

function lerComoBase64(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      const resultado = String(leitor.result ?? "");
      resolve(resultado.slice(resultado.indexOf(",") + 1));
    };
    leitor.onerror = () => reject(new Error("falha ao ler o arquivo"));
    leitor.readAsDataURL(arquivo);
  });
}

function ChatAnalise() {
  const parametros = useSearchParams();
  const preSelecionada = parametros.get("licitacao");

  const [favoritas, setFavoritas] = useState<OpcaoFavorita[]>([]);
  const [licitacaoId, setLicitacaoId] = useState<string>(preSelecionada ?? "");
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [documento, setDocumento] = useState<DocumentoAnexado | null>(null);
  const [extraindo, setExtraindo] = useState(false);
  const seletorArquivo = useRef<HTMLInputElement>(null);
  const fimDoChat = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function carregarFavoritas() {
      const supabase = criarClientNavegador();
      const { data } = await supabase
        .from("favoritos")
        .select("licitacao_id, licitacoes ( objeto_compra )")
        .order("created_at", { ascending: false });

      const opcoes = ((data ?? []) as unknown as Array<{
        licitacao_id: string;
        licitacoes: { objeto_compra: string };
      }>).map((f) => ({
        licitacao_id: f.licitacao_id,
        rotulo: f.licitacoes.objeto_compra.slice(0, 90),
      }));
      setFavoritas(opcoes);
    }
    void carregarFavoritas();
  }, []);

  useEffect(() => {
    fimDoChat.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, pensando]);

  async function anexarPdf(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!arquivo) return;

    setErro(null);
    if (!arquivo.name.toLowerCase().endsWith(".pdf")) {
      setErro("Anexe um arquivo PDF.");
      return;
    }
    if (arquivo.size > MAX_BYTES_PDF) {
      setErro("PDF grande demais — o limite é 6 MB.");
      return;
    }

    setExtraindo(true);
    try {
      const base64 = await lerComoBase64(arquivo);
      const supabase = criarClientNavegador();
      const { data, error } = await supabase.functions.invoke("analise-ia", {
        body: { pdf_base64: base64, pdf_nome: arquivo.name },
      });
      if (error) throw new Error(error.message);
      const extraido = data as {
        nome: string;
        texto: string;
        truncado: boolean;
        paginas: number;
        erro?: string;
      };
      if (extraido?.erro || !extraido?.texto) {
        throw new Error(extraido?.erro ?? "não foi possível ler o PDF");
      }
      setDocumento({
        nome: extraido.nome,
        texto: extraido.texto,
        truncado: extraido.truncado,
        paginas: extraido.paginas,
      });
    } catch (excecao) {
      setErro(
        excecao instanceof Error
          ? `Falha ao ler o PDF: ${excecao.message}`
          : "Falha ao ler o PDF.",
      );
    } finally {
      setExtraindo(false);
    }
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const pergunta = texto.trim();
    if (!pergunta || pensando) return;

    setErro(null);
    setTexto("");
    const novasMensagens: MensagemChat[] = [
      ...mensagens,
      { role: "user", content: pergunta },
    ];
    setMensagens(novasMensagens);
    setPensando(true);

    try {
      const supabase = criarClientNavegador();
      const { data, error } = await supabase.functions.invoke("analise-ia", {
        body: {
          licitacao_id: licitacaoId || undefined,
          documento: documento
            ? { nome: documento.nome, texto: documento.texto }
            : undefined,
          mensagens: novasMensagens,
        },
      });
      if (error) throw new Error(error.message);

      const resposta = (data as { resposta?: string })?.resposta;
      if (!resposta) throw new Error("resposta vazia da IA");
      setMensagens([...novasMensagens, { role: "assistant", content: resposta }]);
    } catch (excecao) {
      setErro(
        excecao instanceof Error
          ? `A IA não respondeu: ${excecao.message}`
          : "A IA não respondeu. Tente novamente.",
      );
    } finally {
      setPensando(false);
    }
  }

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Análise com IA</h1>
          <p className="texto-suave sem-margem">
            Converse sobre uma licitação favorita — a IA conhece os detalhes e
            os itens do edital (via PNCP).
          </p>
        </div>
      </div>

      <div className="cartao">
        <div className="campo">
          <label htmlFor="licitacao">Licitação em análise</label>
          <select
            id="licitacao"
            value={licitacaoId}
            onChange={(e) => {
              setLicitacaoId(e.target.value);
              setMensagens([]);
              setErro(null);
            }}
          >
            <option value="">Nenhuma (perguntas gerais sobre licitações)</option>
            {favoritas.map((f) => (
              <option key={f.licitacao_id} value={f.licitacao_id}>
                {f.rotulo}
              </option>
            ))}
          </select>
          {favoritas.length === 0 && (
            <p className="ajuda">
              Você ainda não tem favoritas — marque uma licitação com ★ no{" "}
              <Link href="/painel">painel</Link> para analisá-la aqui.
            </p>
          )}
        </div>

        <div className="campo">
          <label>Documento (opcional)</label>
          <input
            ref={seletorArquivo}
            type="file"
            accept=".pdf,application/pdf"
            style={{ display: "none" }}
            onChange={anexarPdf}
          />
          {documento ? (
            <p style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="etiqueta etiqueta-nova">
                📄 {documento.nome} ({documento.paginas} pág.)
              </span>
              <button
                type="button"
                className="botao-fantasma"
                onClick={() => setDocumento(null)}
              >
                Remover
              </button>
            </p>
          ) : (
            <p>
              <button
                type="button"
                className="botao botao-secundario"
                disabled={extraindo}
                onClick={() => seletorArquivo.current?.click()}
              >
                {extraindo ? "Lendo PDF..." : "Anexar PDF (edital, termo de referência...)"}
              </button>
            </p>
          )}
          {documento?.truncado && (
            <p className="ajuda">
              Documento longo: a IA recebe as primeiras ~60 mil letras.
            </p>
          )}
        </div>

        <div className="chat-janela">
          {mensagens.length === 0 && (
            <p className="texto-suave" style={{ padding: 8 }}>
              Exemplos: &quot;Vale a pena participar?&quot; · &quot;Quais itens
              têm maior valor?&quot; · &quot;Que documentos costumam ser
              exigidos numa licitação assim?&quot;
            </p>
          )}
          {mensagens.map((mensagem, indice) => (
            <div
              key={indice}
              className={`chat-msg ${
                mensagem.role === "user" ? "chat-msg-usuario" : "chat-msg-ia"
              }`}
            >
              {mensagem.role === "assistant" ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: (props) => (
                      <a {...props} target="_blank" rel="noreferrer" />
                    ),
                  }}
                >
                  {mensagem.content}
                </ReactMarkdown>
              ) : (
                mensagem.content
              )}
            </div>
          ))}
          {pensando && (
            <p className="chat-digitando">A IA está analisando...</p>
          )}
          <div ref={fimDoChat} />
        </div>

        {erro && <p className="mensagem-erro">{erro}</p>}

        <form className="chat-entrada" onSubmit={enviar}>
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Pergunte sobre esta licitação..."
            aria-label="Sua pergunta"
          />
          <button type="submit" className="botao" disabled={pensando}>
            Enviar
          </button>
        </form>
      </div>
    </>
  );
}
