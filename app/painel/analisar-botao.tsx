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
      className="link-analisar"
      onClick={analisar}
      disabled={indo}
    >
      {indo ? "Abrindo análise..." : "Analisar com IA →"}
    </button>
  );
}
