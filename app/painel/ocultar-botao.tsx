"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarClientNavegador } from "@/lib/supabase/client";

/** Oculta um match do painel (marca matches.oculto = true). Reversível só via banco. */
export function OcultarBotao({ matchId }: { matchId: string }) {
  const roteador = useRouter();
  const [ocultando, setOcultando] = useState(false);

  async function ocultar() {
    if (ocultando) return;
    if (
      !window.confirm(
        "Ocultar esta licitação do painel? Ela deixa de aparecer aqui.",
      )
    ) {
      return;
    }
    setOcultando(true);
    const supabase = criarClientNavegador();
    const { error } = await supabase
      .from("matches")
      .update({ oculto: true })
      .eq("id", matchId);
    if (error) {
      setOcultando(false);
      return;
    }
    roteador.refresh();
  }

  return (
    <button
      type="button"
      className="link-ocultar"
      onClick={ocultar}
      disabled={ocultando}
      title="Ocultar esta licitação do painel"
    >
      {ocultando ? "Ocultando..." : "Ocultar"}
    </button>
  );
}
