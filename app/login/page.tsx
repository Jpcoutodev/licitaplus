"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { criarClientNavegador } from "@/lib/supabase/client";
import { Logo } from "../logo";

/** Mensagens que o retorno da confirmação de email pode trazer na query. */
const ERROS_DE_LINK: Record<string, string> = {
  link_invalido:
    "O link de confirmação está incompleto. Peça um novo cadastro ou entre com email e senha.",
  link_expirado:
    "O link de confirmação expirou ou já foi usado. Entre com email e senha.",
  confirmado_outro_local:
    "Seu email foi confirmado, mas o link foi aberto em outro navegador. Entre com email e senha para continuar.",
  recuperacao_outro_navegador:
    "Abra o link de recuperação no mesmo navegador onde você pediu a troca de senha. Se preferir, peça um link novo abaixo.",
  recuperacao_expirada:
    "O link de recuperação expirou ou já foi usado. Peça um link novo abaixo.",
};

export default function PaginaLogin() {
  return (
    <Suspense fallback={null}>
      <Conteudo />
    </Suspense>
  );
}

function Conteudo() {
  const roteador = useRouter();
  const parametros = useSearchParams();
  const [modo, setModo] = useState<"entrar" | "cadastrar" | "recuperar">(
    "entrar",
  );
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Erro vindo do /auth/callback ou /auth/confirm.
  useEffect(() => {
    if (parametros.get("recuperar") === "1") setModo("recuperar");
    const codigo = parametros.get("erro");
    if (!codigo) return;
    // Erro de recuperação: já deixa a tela no modo de pedir um link novo, que
    // é a única saída de quem não lembra a senha.
    if (codigo.startsWith("recuperacao_")) setModo("recuperar");
    setErro(ERROS_DE_LINK[codigo] ?? decodeURIComponent(codigo));
  }, [parametros]);

  async function aoEnviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setAviso(null);
    setEnviando(true);

    const supabase = criarClientNavegador();
    try {
      if (modo === "recuperar") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          // O link do email cria a sessão aqui e segue para a troca de senha.
          redirectTo:
            `${window.location.origin}/auth/callback?next=/nova-senha`,
        });
        if (error) throw error;
        // Resposta igual exista ou não a conta: dizer "email não cadastrado"
        // entregaria a lista de clientes a quem ficasse testando endereços.
        setAviso(
          "Se existir uma conta com esse email, enviamos um link para criar uma nova senha. Confira a caixa de entrada e o spam, e abra o link neste mesmo navegador.",
        );
        return;
      }

      if (modo === "cadastrar") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: {
            // Sem isso o Supabase usa a Site URL do projeto — que apontava
            // para uma rota inexistente e derrubava a confirmação em 404.
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
          },
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
        {modo === "entrar"
          ? "Entrar"
          : modo === "cadastrar"
            ? "Criar conta"
            : "Esqueci minha senha"}
      </h2>

      {modo === "recuperar" && (
        <p className="texto-suave" style={{ marginBottom: 14 }}>
          Informe o email da conta e enviaremos um link para você criar uma
          nova senha.
        </p>
      )}

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
        {/* Recuperação pede só o email: senha é o que a pessoa não tem. */}
        {modo !== "recuperar" && (
          <div className="campo">
            <label htmlFor="senha">Senha</label>
            <input
              id="senha"
              type="password"
              required
              minLength={8}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete={modo === "entrar"
                ? "current-password"
                : "new-password"}
            />
            {modo === "cadastrar" && (
              <p className="ajuda">Mínimo de 8 caracteres.</p>
            )}
          </div>
        )}

        {erro && <p className="mensagem-erro">{erro}</p>}
        {aviso && <p className="mensagem-sucesso">{aviso}</p>}

        <button className="botao" type="submit" disabled={enviando}>
          {enviando
            ? "Enviando..."
            : modo === "entrar"
              ? "Entrar"
              : modo === "cadastrar"
                ? "Criar conta"
                : "Enviar link de recuperação"}
        </button>

        {modo === "cadastrar" && (
          <p className="ajuda" style={{ marginTop: 12 }}>
            Ao criar conta, você concorda com os{" "}
            <Link href="/termos" target="_blank">
              Termos de Uso
            </Link>{" "}
            e a{" "}
            <Link href="/privacidade" target="_blank">
              Política de Privacidade
            </Link>
            .
          </p>
        )}
      </form>

      {modo === "entrar" && (
        <p style={{ marginTop: 12 }}>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setModo("recuperar");
              setErro(null);
              setAviso(null);
            }}
          >
            Esqueci minha senha
          </a>
        </p>
      )}

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
            {modo === "recuperar" ? "Lembrou a senha?" : "Já tem conta?"}{" "}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setModo("entrar");
                setErro(null);
                setAviso(null);
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
