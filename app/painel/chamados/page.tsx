"use client";

import { useCallback, useEffect, useState } from "react";
import { criarClientNavegador } from "@/lib/supabase/client";

interface Chamado {
  id: string;
  user_id: string;
  email: string | null;
  assunto: string;
  categoria: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Mensagem {
  id: string;
  chamado_id: string;
  autor_id: string | null;
  autor_admin: boolean;
  conteudo: string;
  created_at: string;
}

const CATEGORIAS = [
  { valor: "erro", rotulo: "Reportar um erro" },
  { valor: "sugestao", rotulo: "Sugestão de melhoria" },
  { valor: "reclamacao", rotulo: "Reclamação" },
  { valor: "duvida", rotulo: "Dúvida" },
  { valor: "outro", rotulo: "Outro" },
];

const ROTULO_CATEGORIA: Record<string, string> = {
  erro: "Erro",
  sugestao: "Sugestão",
  reclamacao: "Reclamação",
  duvida: "Dúvida",
  outro: "Outro",
};

const STATUS: Array<{ valor: string; rotulo: string }> = [
  { valor: "aberto", rotulo: "Aberto" },
  { valor: "em_andamento", rotulo: "Em andamento" },
  { valor: "respondido", rotulo: "Respondido" },
  { valor: "resolvido", rotulo: "Resolvido" },
  { valor: "fechado", rotulo: "Fechado" },
];

const ROTULO_STATUS: Record<string, string> = Object.fromEntries(
  STATUS.map((s) => [s.valor, s.rotulo]),
);

function EtiquetaStatus({ status }: { status: string }) {
  return (
    <span className={`chamado-status chamado-status--${status}`}>
      {ROTULO_STATUS[status] ?? status}
    </span>
  );
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PaginaChamados() {
  const [meuId, setMeuId] = useState<string | null>(null);
  const [souAdmin, setSouAdmin] = useState(false);
  const [modoAdmin, setModoAdmin] = useState(false);

  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [selecionado, setSelecionado] = useState<Chamado | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);

  const [criando, setCriando] = useState(false);
  const [assunto, setAssunto] = useState("");
  const [categoria, setCategoria] = useState("erro");
  const [descricao, setDescricao] = useState("");
  const [enviando, setEnviando] = useState(false);

  const [resposta, setResposta] = useState("");
  const [respondendo, setRespondendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Identidade + se é admin.
  useEffect(() => {
    async function iniciar() {
      const supabase = criarClientNavegador();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setMeuId(user?.id ?? null);
      if (user?.email) {
        const { data } = await supabase
          .from("admins")
          .select("email")
          .eq("email", user.email)
          .maybeSingle();
        setSouAdmin(Boolean(data));
      }
    }
    void iniciar();
  }, []);

  const carregarLista = useCallback(async () => {
    if (!meuId) return;
    setCarregandoLista(true);
    const supabase = criarClientNavegador();
    let consulta = supabase
      .from("chamados")
      .select("*")
      .order("updated_at", { ascending: false });
    if (!(modoAdmin && souAdmin)) consulta = consulta.eq("user_id", meuId);
    const { data } = await consulta;
    setChamados((data ?? []) as Chamado[]);
    setCarregandoLista(false);
  }, [meuId, modoAdmin, souAdmin]);

  useEffect(() => {
    void carregarLista();
  }, [carregarLista]);

  const carregarMensagens = useCallback(async (chamadoId: string) => {
    const supabase = criarClientNavegador();
    const { data } = await supabase
      .from("chamado_mensagens")
      .select("*")
      .eq("chamado_id", chamadoId)
      .order("created_at", { ascending: true });
    setMensagens((data ?? []) as Mensagem[]);
  }, []);

  async function abrir(chamado: Chamado) {
    setSelecionado(chamado);
    setResposta("");
    setErro(null);
    await carregarMensagens(chamado.id);
  }

  function voltar() {
    setSelecionado(null);
    setMensagens([]);
    void carregarLista();
  }

  async function criarChamado(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    if (!assunto.trim() || !descricao.trim()) {
      setErro("Preencha o assunto e a descrição.");
      return;
    }
    setEnviando(true);
    const supabase = criarClientNavegador();
    const { data: novo, error } = await supabase
      .from("chamados")
      .insert({ assunto: assunto.trim().slice(0, 160), categoria })
      .select()
      .single();
    if (error || !novo) {
      setEnviando(false);
      setErro(error?.message ?? "Não foi possível abrir o chamado.");
      return;
    }
    const { error: erroMsg } = await supabase
      .from("chamado_mensagens")
      .insert({ chamado_id: novo.id, conteudo: descricao.trim().slice(0, 5000) });
    setEnviando(false);
    if (erroMsg) {
      setErro(erroMsg.message);
      return;
    }
    setAssunto("");
    setDescricao("");
    setCategoria("erro");
    setCriando(false);
    await carregarLista();
    await abrir(novo as Chamado);
  }

  async function responder(evento: React.FormEvent) {
    evento.preventDefault();
    if (!selecionado || !resposta.trim()) return;
    setRespondendo(true);
    setErro(null);
    const supabase = criarClientNavegador();
    const { error } = await supabase
      .from("chamado_mensagens")
      .insert({
        chamado_id: selecionado.id,
        conteudo: resposta.trim().slice(0, 5000),
      });
    setRespondendo(false);
    if (error) {
      setErro(error.message);
      return;
    }
    setResposta("");
    await carregarMensagens(selecionado.id);
    await recarregarSelecionado();
  }

  async function recarregarSelecionado() {
    if (!selecionado) return;
    const supabase = criarClientNavegador();
    const { data } = await supabase
      .from("chamados")
      .select("*")
      .eq("id", selecionado.id)
      .maybeSingle();
    if (data) setSelecionado(data as Chamado);
  }

  async function mudarStatus(novoStatus: string) {
    if (!selecionado) return;
    const supabase = criarClientNavegador();
    const { error } = await supabase
      .from("chamados")
      .update({ status: novoStatus })
      .eq("id", selecionado.id);
    if (error) {
      setErro(error.message);
      return;
    }
    await recarregarSelecionado();
  }

  const ehMinhaMensagem = (m: Mensagem) =>
    modoAdmin && souAdmin ? m.autor_admin : !m.autor_admin;

  // ----------------------------------------------------------------- render

  if (selecionado) {
    return (
      <div className="chamado-thread">
        <div className="cabecalho-pagina">
          <div>
            <button
              type="button"
              className="botao-fantasma"
              onClick={voltar}
              style={{ marginBottom: 8 }}
            >
              ← Voltar
            </button>
            <h1 style={{ marginBottom: 6 }}>{selecionado.assunto}</h1>
            <p className="texto-suave sem-margem">
              <span className="etiqueta">
                {ROTULO_CATEGORIA[selecionado.categoria] ?? selecionado.categoria}
              </span>
              <EtiquetaStatus status={selecionado.status} />
              {modoAdmin && souAdmin && selecionado.email && (
                <span className="etiqueta">{selecionado.email}</span>
              )}
            </p>
          </div>
        </div>

        {/* Controles de status */}
        <div className="cartao chamado-controles">
          {souAdmin && modoAdmin ? (
            <label className="campo" style={{ maxWidth: 260, margin: 0 }}>
              <span>Status do chamado</span>
              <select
                value={selecionado.status}
                onChange={(e) => mudarStatus(e.target.value)}
              >
                {STATUS.map((s) => (
                  <option key={s.valor} value={s.valor}>
                    {s.rotulo}
                  </option>
                ))}
              </select>
            </label>
          ) : selecionado.status === "fechado" ? (
            <button
              type="button"
              className="botao botao-secundario"
              onClick={() => mudarStatus("aberto")}
            >
              Reabrir chamado
            </button>
          ) : (
            <button
              type="button"
              className="botao botao-secundario"
              onClick={() => mudarStatus("fechado")}
            >
              Encerrar chamado
            </button>
          )}
        </div>

        {/* Conversa */}
        <div className="chamado-mensagens">
          {mensagens.map((m) => (
            <div
              key={m.id}
              className={`balao ${ehMinhaMensagem(m) ? "balao-meu" : "balao-outro"} ${m.autor_admin ? "balao-suporte" : ""}`}
            >
              <div className="balao-autor">
                {m.autor_admin ? "Suporte Licitaplus" : "Você"}
                <span className="balao-hora">{formatarData(m.created_at)}</span>
              </div>
              <div className="balao-texto">{m.conteudo}</div>
            </div>
          ))}
        </div>

        {selecionado.status === "fechado" ? (
          <p className="texto-suave">
            Este chamado está encerrado. Reabra-o acima para voltar a conversar.
          </p>
        ) : (
          <form onSubmit={responder} className="chamado-responder">
            <textarea
              value={resposta}
              onChange={(e) => setResposta(e.target.value)}
              placeholder="Escreva sua resposta..."
              rows={3}
              maxLength={5000}
            />
            <button type="submit" className="botao" disabled={respondendo}>
              {respondendo ? "Enviando..." : "Enviar resposta"}
            </button>
          </form>
        )}
        {erro && <p className="mensagem-erro">{erro}</p>}
      </div>
    );
  }

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Chamados</h1>
          <p className="texto-suave sem-margem">
            Reporte um erro, mande uma sugestão ou tire uma dúvida — e acompanhe
            a resposta por aqui.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {souAdmin && (
            <button
              type="button"
              className="botao botao-secundario"
              onClick={() => {
                setModoAdmin((v) => !v);
                setCriando(false);
              }}
            >
              {modoAdmin ? "Ver: meus chamados" : "Ver: todos (admin)"}
            </button>
          )}
          {!(modoAdmin && souAdmin) && (
            <button
              type="button"
              className="botao"
              onClick={() => setCriando((v) => !v)}
            >
              {criando ? "Cancelar" : "Novo chamado"}
            </button>
          )}
        </div>
      </div>

      {modoAdmin && souAdmin && (
        <p className="texto-suave" style={{ marginTop: -10, marginBottom: 16 }}>
          Modo administração: você vê e responde os chamados de todos os
          usuários.
        </p>
      )}

      {criando && !(modoAdmin && souAdmin) && (
        <div className="cartao">
          <h3>Abrir um chamado</h3>
          <form onSubmit={criarChamado} style={{ marginTop: 12 }}>
            <div className="campo">
              <label htmlFor="categoria">Tipo</label>
              <select
                id="categoria"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
              >
                {CATEGORIAS.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="assunto">Assunto</label>
              <input
                id="assunto"
                value={assunto}
                onChange={(e) => setAssunto(e.target.value)}
                maxLength={160}
                placeholder="Resuma em uma frase"
              />
            </div>
            <div className="campo">
              <label htmlFor="descricao">Descrição</label>
              <textarea
                id="descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={4}
                maxLength={5000}
                placeholder="Conte com detalhes o que aconteceu ou o que você sugere"
              />
            </div>
            {erro && <p className="mensagem-erro">{erro}</p>}
            <button type="submit" className="botao" disabled={enviando}>
              {enviando ? "Enviando..." : "Abrir chamado"}
            </button>
          </form>
        </div>
      )}

      {carregandoLista ? (
        <p className="texto-suave">Carregando...</p>
      ) : chamados.length === 0 ? (
        <div className="cartao">
          <p className="texto-suave sem-margem">
            {modoAdmin && souAdmin
              ? "Nenhum chamado aberto pelos usuários ainda."
              : "Você ainda não abriu nenhum chamado."}
          </p>
        </div>
      ) : (
        <div className="lista-chamados">
          {chamados.map((c) => (
            <button
              key={c.id}
              type="button"
              className="cartao chamado-item"
              onClick={() => abrir(c)}
            >
              <div className="chamado-item-topo">
                <strong>{c.assunto}</strong>
                <EtiquetaStatus status={c.status} />
              </div>
              <div className="texto-suave chamado-item-meta">
                <span className="etiqueta">
                  {ROTULO_CATEGORIA[c.categoria] ?? c.categoria}
                </span>
                {modoAdmin && souAdmin && c.email ? `${c.email} · ` : ""}
                atualizado em {formatarData(c.updated_at)}
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
