"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { criarClientNavegador } from "@/lib/supabase/client";
import { Logo } from "../logo";

export default function PaginaLogin() {
  const roteador = useRouter();
  const [modo, setModo] = useState<"entrar" | "cadastrar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setAviso(null);
    setEnviando(true);

    const supabase = criarClientNavegador();
    try {
      if (modo === "cadastrar") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
        });
        if (error) throw error;
        if (data.session) {
          roteador.push("/onboarding");
          roteador.refresh();
        } else {
          setAviso(
            "Conta criada! Confirme o cadastro no link que enviamos para o seu email e depois entre.",
          );
          setModo("entrar");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: senha,
        });
        if (error) throw error;
        roteador.push("/painel");
        roteador.refresh();
      }
    } catch (excecao) {
      setErro(
        excecao instanceof Error
          ? traduzirErroAuth(excecao.message)
          : "Erro inesperado. Tente novamente.",
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "56px auto", padding: "0 20px" }}>
      <p style={{ textAlign: "center", marginBottom: 20, display: "flex", justifyContent: "center" }}>
        <Link href="/" aria-label="SentinelaGov">
          <Logo />
        </Link>
      </p>
      <div className="cartao">
      <h2 style={{ marginBottom: 16 }}>
        {modo === "entrar" ? "Entrar" : "Criar conta"}
      </h2>

      <form onSubmit={aoEnviar}>
        <div className="campo">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div className="campo">
          <label htmlFor="senha">Senha</label>
          <input
            id="senha"
            type="password"
            required
            minLength={8}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete={modo === "entrar" ? "current-password" : "new-password"}
          />
          {modo === "cadastrar" && (
            <p className="ajuda">Mínimo de 8 caracteres.</p>
          )}
        </div>

        {erro && <p className="mensagem-erro">{erro}</p>}
        {aviso && <p className="mensagem-sucesso">{aviso}</p>}

        <button className="botao" type="submit" disabled={enviando}>
          {enviando
            ? "Enviando..."
            : modo === "entrar"
              ? "Entrar"
              : "Criar conta"}
        </button>
      </form>

      <p style={{ marginTop: 16 }}>
        {modo === "entrar" ? (
          <>
            Ainda não tem conta?{" "}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setModo("cadastrar");
                setErro(null);
              }}
            >
              Cadastre-se
            </a>
          </>
        ) : (
          <>
            Já tem conta?{" "}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setModo("entrar");
                setErro(null);
              }}
            >
              Entrar
            </a>
          </>
        )}
      </p>
      </div>
    </div>
  );
}

function traduzirErroAuth(mensagem: string): string {
  if (mensagem.includes("Invalid login credentials")) {
    return "Email ou senha incorretos.";
  }
  if (mensagem.includes("already registered")) {
    return "Este email já tem cadastro. Use a opção Entrar.";
  }
  if (mensagem.toLowerCase().includes("password")) {
    return "Senha fraca: use ao menos 8 caracteres.";
  }
  return mensagem;
}
