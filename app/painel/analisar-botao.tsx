"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarClientNavegador } from "@/lib/supabase/client";

/**
 * "Analisar com IA": garante que a licitação está nos favoritos (a análise
 * trabalha sobre favoritas) e navega para a tela de análise já selecionada.
 */
export function AnalisarBotao({
  licitacaoId,
  jaFavorita,
}: {
  licitacaoId: string;
  jaFavorita: boolean;
}) {
  const roteador = useRouter();
  const [indo, setIndo] = useState(false);

  async function analisar() {
    if (indo) return;
    setIndo(true);
    if (!jaFavorita) {
      const supabase = criarClientNavegador();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        // Duplicata (já favoritada em outra aba) não é erro: segue adiante.
        await supabase
          .from("favoritos")
          .insert({ user_id: user.id, licitacao_id: licitacaoId });
      }
    }
    roteador.push(`/painel/analise?licitacao=${licitacaoId}`);
  }

  return (
    <button
      type="button"
      className="botao-analisar"
      onClick={analisar}
      disabled={indo}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
      >
        <path d="M12 2.5l2 5.6 5.6 2-5.6 2-2 5.6-2-5.6-5.6-2 5.6-2z" />
        <path d="M19 14.5l1 2.7 2.7 1-2.7 1-1 2.7-1-2.7-2.7-1 2.7-1z" opacity="0.85" />
      </svg>
      {indo ? "Abrindo análise..." : "Analisar com IA"}
    </button>
  );
}
