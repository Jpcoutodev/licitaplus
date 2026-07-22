"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarClientNavegador } from "@/lib/supabase/client";

/**
 * Oculta (matches.oculto = true) ou reexibe (false) um match no painel.
 * Ocultar pede confirmação; reexibir é imediato.
 */
export function OcultarBotao({
  matchId,
  reexibir = false,
}: {
  matchId: string;
  reexibir?: boolean;
}) {
  const roteador = useRouter();
  const [ocupado, setOcupado] = useState(false);

  async function acao() {
    if (ocupado) return;
    if (
      !reexibir &&
      !window.confirm(
        "Ocultar esta licitação do painel? Ela deixa de aparecer aqui.",
      )
    ) {
      return;
    }
    setOcupado(true);
    const supabase = criarClientNavegador();
    const { error } = await supabase
      .from("matches")
      .update({ oculto: !reexibir })
      .eq("id", matchId);
    if (error) {
      setOcupado(false);
      return;
    }
    roteador.refresh();
  }

  return (
    <button
      type="button"
      className="link-ocultar"
      onClick={acao}
      disabled={ocupado}
      title={reexibir ? "Reexibir no painel" : "Ocultar esta licitação do painel"}
    >
      {ocupado
        ? reexibir ? "Reexibindo..." : "Ocultando..."
        : reexibir ? "Reexibir" : "Ocultar"}
    </button>
  );
}
