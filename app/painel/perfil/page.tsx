"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { criarClientNavegador } from "@/lib/supabase/client";
import { esquemaPerfil } from "@/lib/validacao/perfil";
import { MODALIDADES, UFS } from "@/lib/constantes";
import { limitesDoUsuario } from "@/lib/limites";

interface Perfil {
  id: string;
  nome: string;
  palavras_chave: string[];
  ufs: string[];
  modalidades: number[];
  brasil_inteiro: boolean;
  ativo: boolean;
}

/** Formulário vazio para um perfil novo. */
function perfilVazio(): Omit<Perfil, "id"> {
  return {
    nome: "",
    palavras_chave: [],
    ufs: [],
    modalidades: [],
    brasil_inteiro: false,
    ativo: true,
  };
}

export default function PaginaPerfil() {
  const roteador = useRouter();
  const limites = limitesDoUsuario();

  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [limitePerfis, setLimitePerfis] = useState(1);
  const [planoAtual, setPlanoAtual] = useState<string>("trial");
  const [carregando, setCarregando] = useState(true);
  // null = lista; "novo" = criando; id = editando
  const [editando, setEditando] = useState<string | "novo" | null>(null);
  const [modoInicio, setModoInicio] = useState(false);

  const [form, setForm] = useState<Omit<Perfil, "id">>(perfilVazio());
  const [novaPalavra, setNovaPalavra] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setModoInicio(
        new URLSearchParams(window.location.search).get("inicio") === "1",
      );
    }
  }, []);

  const carregar = useCallback(async () => {
    const supabase = criarClientNavegador();
    const [{ data: lista }, { data: ass }] = await Promise.all([
      supabase
        .from("perfis")
        .select("id, nome, palavras_chave, ufs, modalidades, brasil_inteiro, ativo")
        .order("created_at", { ascending: true }),
      supabase
        .rpc("minha_assinatura")
        .maybeSingle<{ estado: string; plano: string }>(),
    ]);
    const perfisCarregados = (lista ?? []) as Perfil[];
    setPerfis(perfisCarregados);

    const estado = ass?.estado ?? "trial";
    const plano = ass?.plano ?? "trial";
    setPlanoAtual(estado === "admin" ? "admin" : plano);
    setLimitePerfis(
      estado === "admin" ? 99 : estado === "ativo" && plano === "profissional" ? 3 : 1,
    );

    setCarregando(false);
    return perfisCarregados;
  }, []);

  useEffect(() => {
    void carregar().then((lista) => {
      // Onboarding: sem perfil ainda, abre direto o formulário de criação.
      if (lista.length === 0) setEditando("novo");
    });
  }, [carregar]);

  function abrirNovo() {
    setForm(perfilVazio());
    setNovaPalavra("");
    setErro(null);
    setSucesso(null);
    setEditando("novo");
  }

  function abrirEdicao(perfil: Perfil) {
    setForm({
      nome: perfil.nome,
      palavras_chave: perfil.palavras_chave ?? [],
      ufs: perfil.ufs ?? [],
      modalidades: perfil.modalidades ?? [],
      brasil_inteiro: perfil.brasil_inteiro ?? false,
      ativo: perfil.ativo,
    });
    setNovaPalavra("");
    setErro(null);
    setSucesso(null);
    setEditando(perfil.id);
  }

  function adicionarPalavra() {
    const termo = novaPalavra.trim().toLowerCase();
    if (!termo) return;
    if (!form.palavras_chave.includes(termo)) {
      setForm({ ...form, palavras_chave: [...form.palavras_chave, termo] });
    }
    setNovaPalavra("");
  }

  function alternar<T>(lista: T[], valor: T): T[] {
    return lista.includes(valor)
      ? lista.filter((v) => v !== valor)
      : [...lista, valor];
  }

  async function excluirPerfil(perfil: Perfil) {
    if (
      !window.confirm(
        `Excluir o perfil "${perfil.nome}"? As licitações encontradas por ele saem do painel.`,
      )
    ) {
      return;
    }
    setExcluindo(perfil.id);
    setErro(null);
    const supabase = criarClientNavegador();
    const { error } = await supabase.from("perfis").delete().eq("id", perfil.id);
    setExcluindo(null);
    if (error) {
      setErro(`Não foi possível excluir: ${error.message}`);
      return;
    }
    await carregar();
  }

  async function aoSalvar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setSucesso(null);

    const ufsFinais = form.brasil_inteiro ? [] : form.ufs;
    const validacao = esquemaPerfil().safeParse({
      nome: form.nome,
      palavras_chave: form.palavras_chave,
      brasil_inteiro: form.brasil_inteiro,
      ufs: ufsFinais,
      modalidades: form.modalidades,
      ativo: form.ativo,
    });
    if (!validacao.success) {
      setErro(validacao.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    setSalvando(true);
    const supabase = criarClientNavegador();
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada. Entre novamente.");

      let idSalvo: string;
      if (editando && editando !== "novo") {
        const { error } = await supabase
          .from("perfis")
          .update(validacao.data)
          .eq("id", editando);
        if (error) throw new Error(error.message);
        idSalvo = editando;
      } else {
        const { data, error } = await supabase
          .from("perfis")
          .insert({ ...validacao.data, user_id: user.id })
          .select("id")
          .single();
        if (error) {
          throw new Error(
            error.message.includes("limite de perfis")
              ? "Seu plano não permite mais perfis. Assine o Profissional para ter até 3."
              : error.message,
          );
        }
        idSalvo = data.id;
      }

      setSucesso(
        "Perfil salvo! Buscando licitações abertas compatíveis — isso pode levar alguns instantes...",
      );

      // Busca retroativa pontual para o usuário já ver resultados.
      const { data: resultado, error: erroBusca } = await supabase.functions
        .invoke("busca-retroativa", { body: { perfil_id: idSalvo } });
      if (erroBusca) {
        setSucesso(
          "Perfil salvo! A busca automática encontrará as licitações na próxima janela de coleta.",
        );
      } else {
        const novos =
          (resultado as { matches_novos?: number })?.matches_novos ?? 0;
        setSucesso(
          novos > 0
            ? `Perfil salvo! Encontramos ${novos} licitação(ões) compatível(is).`
            : "Perfil salvo! Nenhuma licitação aberta compatível agora; você será avisado quando surgir.",
        );
      }

      if (modoInicio) {
        roteador.push("/painel");
        roteador.refresh();
        return;
      }
      await carregar();
      setEditando(null);
      roteador.refresh();
    } catch (excecao) {
      setErro(
        excecao instanceof Error ? excecao.message : "Erro ao salvar o perfil.",
      );
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <p>Carregando...</p>;

  // ------------------------------------------------------------- formulário
  if (editando !== null) {
    const ehNovo = editando === "novo";
    return (
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        {modoInicio && <p className="passo-onboarding">Passo 2 de 2</p>}
        <h1 style={{ marginBottom: 6 }}>
          {modoInicio
            ? "Configure sua primeira busca"
            : ehNovo
              ? "Novo perfil de busca"
              : "Editar perfil"}
        </h1>
        {modoInicio && (
          <p className="texto-suave" style={{ marginTop: 0, marginBottom: 16 }}>
            Diga o que sua empresa vende e onde. Assim que salvar, seu painel
            abre com as licitações compatíveis.
          </p>
        )}

        <form onSubmit={aoSalvar}>
          <div className="cartao">
            <div className="campo">
              <label htmlFor="nome-perfil">Nome do perfil</label>
              <input
                id="nome-perfil"
                type="text"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="ex.: Limpeza em SP, TI Brasil inteiro"
                maxLength={60}
              />
              <p className="ajuda">
                Um rótulo para você identificar esta busca.
              </p>
            </div>

            <div className="campo">
              <label htmlFor="palavra">
                O que sua empresa vende? (palavras-chave)
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  id="palavra"
                  type="text"
                  value={novaPalavra}
                  onChange={(e) => setNovaPalavra(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      adicionarPalavra();
                    }
                  }}
                  placeholder="ex.: merenda escolar"
                />
                <button
                  type="button"
                  className="botao botao-secundario"
                  onClick={adicionarPalavra}
                >
                  Adicionar
                </button>
              </div>
              <p className="ajuda">
                Até {limites.maxPalavrasChave} palavras-chave por perfil.
                Pressione Enter ou clique em Adicionar.
              </p>
              <div className="dica-perfil">
                <strong>Dica:</strong> cada palavra-chave é buscada separadamente —
                quanto mais <strong>variações e sinônimos</strong> você adicionar,
                mais licitações aparecem. Ex.: para inteligência artificial, use
                também <em>machine learning</em> e <em>aprendizado de máquina</em>;
                para limpeza, <em>produtos de limpeza</em> e <em>saneantes</em>.
              </div>
              <div style={{ marginTop: 8 }}>
                {form.palavras_chave.map((palavra) => (
                  <span key={palavra} className="etiqueta">
                    {palavra}{" "}
                    <a
                      href="#"
                      aria-label={`remover ${palavra}`}
                      onClick={(e) => {
                        e.preventDefault();
                        setForm({
                          ...form,
                          palavras_chave: form.palavras_chave.filter(
                            (p) => p !== palavra,
                          ),
                        });
                      }}
                    >
                      ×
                    </a>
                  </span>
                ))}
              </div>
            </div>

            <div className="campo">
              <label>Onde sua empresa quer buscar licitações?</label>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontWeight: 600,
                  marginBottom: 10,
                }}
              >
                <input
                  type="checkbox"
                  checked={form.brasil_inteiro}
                  onChange={() =>
                    setForm({ ...form, brasil_inteiro: !form.brasil_inteiro })}
                />
                🇧🇷 Brasil inteiro (todos os estados)
              </label>

              {!form.brasil_inteiro && (
                <>
                  <div className="opcoes">
                    {UFS.map((uf) => (
                      <label key={uf}>
                        <input
                          type="checkbox"
                          checked={form.ufs.includes(uf)}
                          onChange={() =>
                            setForm({ ...form, ufs: alternar(form.ufs, uf) })}
                        />
                        {uf}
                      </label>
                    ))}
                  </div>
                  <p className="ajuda">
                    Selecione os estados de interesse, ou marque Brasil inteiro
                    acima para o país todo.
                  </p>
                </>
              )}
              {form.brasil_inteiro && (
                <p className="ajuda">
                  Buscando em todos os estados. Para focar em regiões
                  específicas, desmarque Brasil inteiro e escolha as UFs.
                </p>
              )}
            </div>

            <div className="campo">
              <label>Modalidades de interesse</label>
              <div className="opcoes">
                {MODALIDADES.map((modalidade) => (
                  <label key={modalidade.codigo}>
                    <input
                      type="checkbox"
                      checked={form.modalidades.includes(modalidade.codigo)}
                      onChange={() =>
                        setForm({
                          ...form,
                          modalidades: alternar(
                            form.modalidades,
                            modalidade.codigo,
                          ),
                        })}
                    />
                    {modalidade.nome}
                  </label>
                ))}
              </div>
              <p className="ajuda">Sem seleção = todas as modalidades.</p>
            </div>

            <div className="campo">
              <label>
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={() => setForm({ ...form, ativo: !form.ativo })}
                />{" "}
                Perfil ativo (receber alertas por email)
              </label>
            </div>

            {erro && <p className="mensagem-erro">{erro}</p>}
            {sucesso && <p className="mensagem-sucesso">{sucesso}</p>}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="botao" type="submit" disabled={salvando}>
                {salvando
                  ? "Salvando..."
                  : modoInicio
                    ? "Salvar e ver meu painel"
                    : "Salvar perfil"}
              </button>
              {!modoInicio && perfis.length > 0 && (
                <button
                  type="button"
                  className="botao botao-secundario"
                  onClick={() => setEditando(null)}
                  disabled={salvando}
                >
                  Voltar
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    );
  }

  // ------------------------------------------------------------------ lista
  const noLimite = perfis.length >= limitePerfis;
  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Perfis de busca</h1>
          <p className="texto-suave sem-margem">
            {perfis.length} de {limitePerfis > 90 ? "∞" : limitePerfis}{" "}
            {limitePerfis === 1 ? "perfil" : "perfis"} do seu plano.
          </p>
        </div>
        <button
          type="button"
          className="botao"
          onClick={abrirNovo}
          disabled={noLimite}
        >
          + Novo perfil
        </button>
      </div>

      {noLimite && planoAtual !== "profissional" && planoAtual !== "admin" && (
        <div className="banner-trial">
          <span>
            Quer monitorar mais de um ramo ou região ao mesmo tempo? O plano{" "}
            <strong>Profissional</strong> tem até 3 perfis independentes.
          </span>
          <Link href="/assinar" className="botao botao-mini">
            Ver planos
          </Link>
        </div>
      )}

      {erro && <p className="mensagem-erro">{erro}</p>}

      {perfis.map((perfil) => (
        <div key={perfil.id} className="cartao">
          <div className="chamado-item-topo">
            <strong>{perfil.nome}</strong>
            <span
              className={`chamado-status ${perfil.ativo ? "chamado-status--respondido" : "chamado-status--fechado"}`}
            >
              {perfil.ativo ? "Ativo" : "Pausado"}
            </span>
          </div>
          <p className="detalhes texto-suave" style={{ marginTop: 6 }}>
            {perfil.palavras_chave.map((p) => (
              <span key={p} className="etiqueta">
                {p}
              </span>
            ))}
          </p>
          <p className="detalhes texto-suave" style={{ marginTop: 6 }}>
            {perfil.brasil_inteiro
              ? "🇧🇷 Brasil inteiro"
              : `Estados: ${perfil.ufs.join(", ") || "—"}`}
            {" · "}
            {perfil.modalidades.length === 0
              ? "todas as modalidades"
              : `${perfil.modalidades.length} modalidade(s)`}
          </p>
          <p style={{ marginTop: 12, display: "flex", gap: 12 }}>
            <button
              type="button"
              className="botao botao-secundario"
              onClick={() => abrirEdicao(perfil)}
            >
              Editar
            </button>
            <button
              type="button"
              className="botao-fantasma"
              onClick={() => excluirPerfil(perfil)}
              disabled={excluindo === perfil.id}
            >
              {excluindo === perfil.id ? "Excluindo..." : "Excluir"}
            </button>
          </p>
        </div>
      ))}
    </>
  );
}
