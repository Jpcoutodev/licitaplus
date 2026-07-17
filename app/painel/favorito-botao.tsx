"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarClientNavegador } from "@/lib/supabase/client";

/** Estrela de favoritar/desfavoritar uma licitação. */
export function FavoritoBotao({
  licitacaoId,
  favoritoIdInicial,
}: {
  licitacaoId: string;
  favoritoIdInicial: string | null;
}) {
  const roteador = useRouter();
  const [favoritoId, setFavoritoId] = useState<string | null>(
    favoritoIdInicial,
  );
  const [ocupado, setOcupado] = useState(false);

  async function alternar() {
    if (ocupado) return;
    setOcupado(true);
    const supabase = criarClientNavegador();
    try {
      if (favoritoId) {
        const { error } = await supabase
          .from("favoritos")
          .delete()
          .eq("id", favoritoId);
        if (!error) setFavoritoId(null);
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase
          .from("favoritos")
          .insert({ user_id: user.id, licitacao_id: licitacaoId })
          .select("id")
          .single();
        if (!error && data) setFavoritoId(data.id);
      }
      roteador.refresh();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <button
      type="button"
      className={`botao-estrela ${favoritoId ? "ativo" : ""}`}
      onClick={alternar}
      disabled={ocupado}
      aria-label={favoritoId ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      title={favoritoId ? "Remover dos favoritos" : "Adicionar aos favoritos"}
    >
      {favoritoId ? "★" : "☆"}
    </button>
  );
}
