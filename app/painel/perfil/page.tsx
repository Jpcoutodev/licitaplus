"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { criarClientNavegador } from "@/lib/supabase/client";
import { esquemaPerfil } from "@/lib/validacao/perfil";
import { MODALIDADES, UFS } from "@/lib/constantes";
import { limitesDoUsuario } from "@/lib/limites";

export default function PaginaPerfil() {
  const roteador = useRouter();
  const limites = limitesDoUsuario();

  const [perfilId, setPerfilId] = useState<string | null>(null);
  const [palavras, setPalavras] = useState<string[]>([]);
  const [novaPalavra, setNovaPalavra] = useState("");
  const [ufs, setUfs] = useState<string[]>([]);
  const [brasilInteiro, setBrasilInteiro] = useState(false);
  const [modalidades, setModalidades] = useState<number[]>([]);
  const [ativo, setAtivo] = useState(true);

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    async function carregar() {
      const supabase = criarClientNavegador();
      const { data } = await supabase
        .from("perfis")
        .select("id, palavras_chave, ufs, modalidades, brasil_inteiro, ativo")
        .limit(1)
        .maybeSingle();

      if (data) {
        setPerfilId(data.id);
        setPalavras(data.palavras_chave ?? []);
        setUfs(data.ufs ?? []);
        setBrasilInteiro(data.brasil_inteiro ?? false);
        setModalidades(data.modalidades ?? []);
        setAtivo(data.ativo);
      }
      setCarregando(false);
    }
    void carregar();
  }, []);

  function adicionarPalavra() {
    const termo = novaPalavra.trim().toLowerCase();
    if (!termo) return;
    if (palavras.includes(termo)) {
      setNovaPalavra("");
      return;
    }
    setPalavras([...palavras, termo]);
    setNovaPalavra("");
  }

  function alternar<T>(lista: T[], valor: T): T[] {
    return lista.includes(valor)
      ? lista.filter((v) => v !== valor)
      : [...lista, valor];
  }

  async function aoSalvar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setSucesso(null);

    // Validação de TODA entrada do usuário antes de persistir.
    // Brasil inteiro ignora a seleção de UFs (consulta nacional).
    const ufsFinais = brasilInteiro ? [] : ufs;
    const validacao = esquemaPerfil().safeParse({
      palavras_chave: palavras,
      brasil_inteiro: brasilInteiro,
      ufs: ufsFinais,
      modalidades,
      ativo,
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

      let idSalvo = perfilId;
      if (perfilId) {
        const { error } = await supabase
          .from("perfis")
          .update(validacao.data)
          .eq("id", perfilId);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await supabase
          .from("perfis")
          .insert({ ...validacao.data, user_id: user.id })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        idSalvo = data.id;
        setPerfilId(data.id);
      }

      setSucesso(
        "Perfil salvo! Buscando licitações abertas compatíveis — isso pode levar alguns instantes...",
      );

      // Busca retroativa pontual para o usuário já ver resultados.
      if (idSalvo) {
        const { data: resultado, error: erroBusca } = await supabase.functions
          .invoke("busca-retroativa", { body: { perfil_id: idSalvo } });
        if (erroBusca) {
          setSucesso(
            "Perfil salvo! A busca automática encontrará as licitações na próxima janela de coleta.",
          );
        } else {
          const novos = (resultado as { matches_novos?: number })
            ?.matches_novos ?? 0;
          setSucesso(
            novos > 0
              ? `Perfil salvo! Encontramos ${novos} licitação(ões) compatível(is) — veja no painel.`
              : "Perfil salvo! Nenhuma licitação aberta compatível agora; você será avisado por email quando surgir.",
          );
        }
      }

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

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 16 }}>
        {perfilId ? "Editar perfil" : "Criar perfil"}
      </h1>

      <form onSubmit={aoSalvar}>
        <div className="cartao">
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
              Até {limites.maxPalavrasChave} palavras-chave no plano gratuito.
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
              {palavras.map((palavra) => (
                <span key={palavra} className="etiqueta">
                  {palavra}{" "}
                  <a
                    href="#"
                    aria-label={`remover ${palavra}`}
                    onClick={(e) => {
                      e.preventDefault();
                      setPalavras(palavras.filter((p) => p !== palavra));
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
                checked={brasilInteiro}
                onChange={() => setBrasilInteiro(!brasilInteiro)}
              />
              🇧🇷 Brasil inteiro (todos os estados)
            </label>

            {!brasilInteiro && (
              <>
                <div className="opcoes">
                  {UFS.map((uf) => (
                    <label key={uf}>
                      <input
                        type="checkbox"
                        checked={ufs.includes(uf)}
                        onChange={() => setUfs(alternar(ufs, uf))}
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
            {brasilInteiro && (
              <p className="ajuda">
                Buscando em todos os estados. Para focar em regiões específicas,
                desmarque Brasil inteiro e escolha as UFs.
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
                    checked={modalidades.includes(modalidade.codigo)}
                    onChange={() =>
                      setModalidades(alternar(modalidades, modalidade.codigo))}
                  />
                  {modalidade.nome}
                </label>
              ))}
            </div>
            <p className="ajuda">
              Sem seleção = todas as modalidades.
            </p>
          </div>

          <div className="campo">
            <label>
              <input
                type="checkbox"
                checked={ativo}
                onChange={() => setAtivo(!ativo)}
              />{" "}
              Perfil ativo (receber alertas por email)
            </label>
          </div>

          {erro && <p className="mensagem-erro">{erro}</p>}
          {sucesso && <p className="mensagem-sucesso">{sucesso}</p>}

          <button className="botao" type="submit" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar perfil"}
          </button>
        </div>
      </form>
    </div>
  );
}
