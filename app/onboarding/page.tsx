"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { criarClientNavegador } from "@/lib/supabase/client";
import {
  normalizarDocumento,
  validarCpfCnpj,
} from "@/lib/validacao/documento";
import { Logo } from "../logo";

export default function PaginaOnboarding() {
  const roteador = useRouter();
  const [nomeEmpresa, setNomeEmpresa] = useState("");
  const [telefone, setTelefone] = useState("");
  const [documento, setDocumento] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Se a conta já existe, pré-preenche (permite revisar) — senão, form vazio.
  useEffect(() => {
    async function carregar() {
      const supabase = criarClientNavegador();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        roteador.replace("/login");
        return;
      }
      const { data } = await supabase
        .from("contas")
        .select("nome_empresa, telefone, cpf_cnpj")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setNomeEmpresa(data.nome_empresa ?? "");
        setTelefone(data.telefone ?? "");
        setDocumento(data.cpf_cnpj ?? "");
      }
      setCarregando(false);
    }
    void carregar();
  }, [roteador]);

  async function aoEnviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);

    const nome = nomeEmpresa.trim();
    const tel = telefone.trim();
    const doc = normalizarDocumento(documento);
    if (nome.length < 2) {
      setErro("Informe o nome da sua empresa.");
      return;
    }
    if (!validarCpfCnpj(doc)) {
      setErro("CPF ou CNPJ inválido — confira os números digitados.");
      return;
    }
    if (tel.replace(/\D/g, "").length < 8) {
      setErro("Informe um telefone válido com DDD.");
      return;
    }

    setSalvando(true);
    const supabase = criarClientNavegador();
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada. Entre novamente.");

      const { error } = await supabase.from("contas").upsert(
        {
          user_id: user.id,
          nome_empresa: nome.slice(0, 160),
          telefone: tel.slice(0, 40),
          cpf_cnpj: doc,
        },
        { onConflict: "user_id" },
      );
      if (error) {
        // Documento já usado por outra conta = tentativa de segundo trial.
        if (error.code === "23505") {
          throw new Error(
            "Este CPF/CNPJ já possui uma conta no SentinelaGov. Entre com o email cadastrado ou assine um plano nela.",
          );
        }
        throw new Error(error.message);
      }

      // Próximo passo do onboarding: configurar o perfil de busca; ao salvar
      // lá, o usuário segue para o painel (parâmetro inicio=1).
      roteador.push("/painel/perfil?inicio=1");
      roteador.refresh();
    } catch (excecao) {
      setErro(
        excecao instanceof Error ? excecao.message : "Não foi possível salvar.",
      );
      setSalvando(false);
    }
  }

  return (
    <div style={{ maxWidth: 460, margin: "56px auto", padding: "0 20px" }}>
      <p
        style={{
          textAlign: "center",
          marginBottom: 20,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Logo />
      </p>
      <div className="cartao">
        <p className="passo-onboarding">Passo 1 de 2</p>
        <h2 style={{ margin: "4px 0 4px" }}>Bem-vindo(a)! 👋</h2>
        <p className="texto-suave" style={{ marginTop: 0 }}>
          Conte um pouco sobre a sua empresa para personalizarmos o atendimento.
        </p>

        {carregando ? (
          <p className="texto-suave">Carregando...</p>
        ) : (
          <form onSubmit={aoEnviar} style={{ marginTop: 14 }}>
            <div className="campo">
              <label htmlFor="nome-empresa">Nome da empresa</label>
              <input
                id="nome-empresa"
                type="text"
                required
                value={nomeEmpresa}
                onChange={(e) => setNomeEmpresa(e.target.value)}
                placeholder="ex.: Alfa Comércio e Serviços Ltda"
                autoComplete="organization"
              />
            </div>
            <div className="campo">
              <label htmlFor="documento">CNPJ (ou CPF, se ainda não tem empresa)</label>
              <input
                id="documento"
                type="text"
                required
                inputMode="numeric"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                placeholder="ex.: 12.345.678/0001-90"
              />
              <p className="ajuda">
                Usado para identificar sua empresa e liberar o teste grátis de
                14 dias (um teste por CPF/CNPJ).
              </p>
            </div>
            <div className="campo">
              <label htmlFor="telefone">Telefone (com DDD)</label>
              <input
                id="telefone"
                type="tel"
                required
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="ex.: (11) 99999-9999"
                autoComplete="tel"
              />
            </div>

            {erro && <p className="mensagem-erro">{erro}</p>}

            <button className="botao" type="submit" disabled={salvando}>
              {salvando ? "Salvando..." : "Continuar"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
