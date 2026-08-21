"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { criarClientNavegador } from "@/lib/supabase/client";
import { Logo } from "../logo";

/**
 * Definir nova senha depois do link de recuperação.
 *
 * O link do email cria a sessão (em /auth/callback ou /auth/confirm) e manda
 * para cá. Tela própria em vez de jogar em Configurações: quem chega aqui veio
 * para uma coisa só, e procurar o formulário no meio dos ajustes é atrito num
 * momento em que a pessoa já está sem acesso.
 */
export default function PaginaNovaSenha() {
  const roteador = useRouter();
  const [temSessao, setTemSessao] = useState<boolean | null>(null);
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  // O link de recuperação já autenticou; sem sessão não há o que trocar.
  useEffect(() => {
    async function conferir() {
      const supabase = criarClientNavegador();
      const { data: { user } } = await supabase.auth.getUser();
      setTemSessao(Boolean(user));
    }
    void conferir();
  }, []);

  async function aoEnviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);

    if (senha.length < 8) {
      setErro("A nova senha precisa de ao menos 8 caracteres.");
      return;
    }
    if (senha !== confirmacao) {
      setErro("As duas senhas não são iguais.");
      return;
    }

    setSalvando(true);
    const supabase = criarClientNavegador();
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);

    if (error) {
      setErro(
        error.message.toLowerCase().includes("session")
          ? "O link de recuperação expirou. Peça um novo na tela de login."
          : error.message,
      );
      return;
    }

    setPronto(true);
    // Um instante para a pessoa ler a confirmação antes de trocar de tela.
    setTimeout(() => {
      roteador.push("/painel");
      roteador.refresh();
    }, 1200);
  }

  return (
    <div style={{ maxWidth: 420, margin: "56px auto", padding: "0 20px" }}>
      <p
        style={{
          textAlign: "center",
          marginBottom: 20,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Link href="/" aria-label="SentinelaGov">
          <Logo />
        </Link>
      </p>

      <div className="cartao">
        <h2 style={{ marginBottom: 16 }}>Definir nova senha</h2>

        {temSessao === false && (
          <>
            <p className="mensagem-erro">
              Este link de recuperação não é mais válido — ele expira depois de
              algum tempo e só funciona uma vez.
            </p>
            <p style={{ marginTop: 12 }}>
              <Link href="/login?recuperar=1">Pedir um novo link</Link>
            </p>
          </>
        )}

        {temSessao === true && !pronto && (
          <form onSubmit={aoEnviar}>
            <div className="campo">
              <label htmlFor="senha">Nova senha</label>
              <input
                id="senha"
                type="password"
                required
                minLength={8}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="new-password"
                autoFocus
              />
              <p className="ajuda">Mínimo de 8 caracteres.</p>
            </div>
            <div className="campo">
              <label htmlFor="confirmacao">Repita a nova senha</label>
              <input
                id="confirmacao"
                type="password"
                required
                minLength={8}
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            {erro && <p className="mensagem-erro">{erro}</p>}

            <button className="botao" type="submit" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar nova senha"}
            </button>
          </form>
        )}

        {pronto && (
          <p className="mensagem-sucesso">
            Senha alterada. Levando você para o painel...
          </p>
        )}
      </div>
    </div>
  );
}
