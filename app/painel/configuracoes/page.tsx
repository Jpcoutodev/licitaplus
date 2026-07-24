"use client";

import { useEffect, useState } from "react";
import { criarClientNavegador } from "@/lib/supabase/client";
import { PushToggle } from "../push-toggle";

export default function PaginaConfiguracoes() {
  const [email, setEmail] = useState<string>("");
  const [novaSenha, setNovaSenha] = useState("");
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [msgSenha, setMsgSenha] = useState<{ erro?: string; ok?: string }>({});

  const [qtdPerfis, setQtdPerfis] = useState(0);
  const [alertasAtivos, setAlertasAtivos] = useState<boolean | null>(null);
  const [msgAlertas, setMsgAlertas] = useState<string | null>(null);

  useEffect(() => {
    async function carregar() {
      const supabase = criarClientNavegador();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setEmail(user?.email ?? "");

      const { data: perfis } = await supabase
        .from("perfis")
        .select("id, ativo");
      const lista = perfis ?? [];
      setQtdPerfis(lista.length);
      if (lista.length > 0) {
        setAlertasAtivos(lista.some((p) => p.ativo));
      }
    }
    void carregar();
  }, []);

  async function alterarSenha(evento: React.FormEvent) {
    evento.preventDefault();
    setMsgSenha({});
    if (novaSenha.length < 8) {
      setMsgSenha({ erro: "A nova senha precisa de ao menos 8 caracteres." });
      return;
    }
    setSalvandoSenha(true);
    const supabase = criarClientNavegador();
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    setSalvandoSenha(false);
    if (error) {
      setMsgSenha({ erro: error.message });
    } else {
      setNovaSenha("");
      setMsgSenha({ ok: "Senha alterada com sucesso." });
    }
  }

  async function alternarAlertas() {
    if (qtdPerfis === 0 || alertasAtivos === null) return;
    const novoValor = !alertasAtivos;
    setAlertasAtivos(novoValor);
    setMsgAlertas(null);

    const supabase = criarClientNavegador();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    // Vale para TODOS os perfis do usuário (pausa/reativação geral).
    const { error } = await supabase
      .from("perfis")
      .update({ ativo: novoValor })
      .eq("user_id", user.id);
    if (error) {
      setAlertasAtivos(!novoValor);
      setMsgAlertas(`Não foi possível salvar: ${error.message}`);
    } else {
      setMsgAlertas(
        novoValor
          ? "Alertas reativados — seus perfis voltam a ser monitorados."
          : "Alertas pausados em todos os perfis — você não receberá emails até reativar.",
      );
    }
  }

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Configurações</h1>
          <p className="texto-suave sem-margem">Sua conta e preferências.</p>
        </div>
      </div>

      <div className="cartao">
        <h3>Conta</h3>
        <p className="texto-suave" style={{ marginTop: 6 }}>
          Email de acesso e de recebimento dos alertas:{" "}
          <strong>{email || "..."}</strong>
        </p>
      </div>

      <div className="cartao">
        <h3>Assinatura</h3>
        <p className="texto-suave" style={{ marginTop: 6 }}>
          Plano atual, uso das análises de IA, perfis e cobrança.
        </p>
        <p style={{ marginTop: 12 }}>
          <a href="/painel/assinatura" className="botao botao-secundario">
            Ver minha assinatura
          </a>
        </p>
      </div>

      <div className="cartao">
        <h3>Alertas por email</h3>
        {alertasAtivos === null ? (
          <p className="texto-suave" style={{ marginTop: 6 }}>
            Crie um perfil de busca para ativar os alertas.
          </p>
        ) : (
          <>
            <p className="texto-suave" style={{ marginTop: 6 }}>
              {alertasAtivos
                ? qtdPerfis > 1
                  ? "Seus perfis estão ativos: novas licitações compatíveis chegam por email."
                  : "Seu perfil está ativo: novas licitações compatíveis chegam por email."
                : "Alertas pausados: nenhum perfil está sendo monitorado."}
            </p>
            <p style={{ marginTop: 12 }}>
              <button
                type="button"
                className="botao botao-secundario"
                onClick={alternarAlertas}
              >
                {alertasAtivos ? "Pausar alertas" : "Reativar alertas"}
              </button>
            </p>
          </>
        )}
        {msgAlertas && <p className="mensagem-sucesso">{msgAlertas}</p>}
      </div>

      <div className="cartao">
        <h3>Notificações no aparelho (push)</h3>
        <PushToggle />
      </div>

      <div className="cartao">
        <h3>Alterar senha</h3>
        <form onSubmit={alterarSenha} style={{ marginTop: 10 }}>
          <div className="campo" style={{ maxWidth: 360 }}>
            <label htmlFor="nova-senha">Nova senha</label>
            <input
              id="nova-senha"
              type="password"
              minLength={8}
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              autoComplete="new-password"
            />
            <p className="ajuda">Mínimo de 8 caracteres.</p>
          </div>
          {msgSenha.erro && <p className="mensagem-erro">{msgSenha.erro}</p>}
          {msgSenha.ok && <p className="mensagem-sucesso">{msgSenha.ok}</p>}
          <button type="submit" className="botao" disabled={salvandoSenha}>
            {salvandoSenha ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>
      </div>

      <div className="cartao">
        <h3>Sessão</h3>
        <form action="/auth/sair" method="post" style={{ marginTop: 10 }}>
          <button type="submit" className="botao botao-secundario">
            Sair da conta
          </button>
        </form>
      </div>
    </>
  );
}
