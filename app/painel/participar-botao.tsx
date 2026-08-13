"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarClientNavegador } from "@/lib/supabase/client";

/**
 * "Participar": entra na lista da aba Licitando e leva para lá, onde o
 * calendário e o status vivem. Não favorita — favorito é "quero olhar",
 * participação é "estou dentro".
 *
 * Quando já está participando o botão vira só o atalho para a aba; sair da
 * disputa é ação da própria aba (status "desisti" ou remover), para ninguém
 * apagar o acompanhamento com um clique errado no painel.
 */
export function ParticiparBotao({
  licitacaoId,
  participando,
}: {
  licitacaoId: string;
  participando: boolean;
}) {
  const roteador = useRouter();
  const [indo, setIndo] = useState(false);

  async function participar() {
    if (indo) return;
    setIndo(true);
    if (!participando) {
      const supabase = criarClientNavegador();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        // Duplicata (já marcada em outra aba) não é erro: segue adiante.
        await supabase
          .from("participacoes")
          .insert({ user_id: user.id, licitacao_id: licitacaoId });
      }
    }
    roteador.push("/painel/licitando");
  }

  return (
    <button
      type="button"
      className={`botao-participar ${participando ? "ativo" : ""}`}
      onClick={participar}
      disabled={indo}
      title={
        participando
          ? "Você está participando — ver na aba Licitando"
          : "Marcar que sua empresa vai participar desta licitação"
      }
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {participando ? (
          <path d="m5 12.5 4.2 4.2L19 7" />
        ) : (
          <>
            <path d="M12 5v14M5 12h14" />
          </>
        )}
      </svg>
      {indo ? "Abrindo..." : participando ? "Participando" : "Participar"}
    </button>
  );
}
