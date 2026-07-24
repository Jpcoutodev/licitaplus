"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarClientNavegador } from "@/lib/supabase/client";

/** Marca como atendido/pendente e permite excluir um lead (admin via RLS). */
export function LeadToggle({
  id,
  inicial,
}: {
  id: string;
  inicial: boolean;
}) {
  const roteador = useRouter();
  const [atendido, setAtendido] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);

  async function alternar() {
    if (ocupado) return;
    setOcupado(true);
    const novo = !atendido;
    const supabase = criarClientNavegador();
    const { error } = await supabase
      .from("consultoria_leads")
      .update({ atendido: novo })
      .eq("id", id);
    setOcupado(false);
    if (!error) setAtendido(novo);
  }

  async function excluir() {
    if (ocupado || !window.confirm("Excluir este lead?")) return;
    setOcupado(true);
    const supabase = criarClientNavegador();
    const { error } = await supabase
      .from("consultoria_leads")
      .delete()
      .eq("id", id);
    if (error) {
      setOcupado(false);
      return;
    }
    roteador.refresh();
  }

  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <button
        type="button"
        className={`lead-toggle ${atendido ? "lead-toggle-ok" : ""}`}
        onClick={alternar}
        disabled={ocupado}
        title={atendido ? "Marcar como pendente" : "Marcar como atendido"}
      >
        {atendido ? "✅ Atendido" : "⏳ Pendente"}
      </button>
      <button
        type="button"
        className="lead-excluir"
        onClick={excluir}
        disabled={ocupado}
        title="Excluir lead"
        aria-label="Excluir lead"
      >
        ✕
      </button>
    </span>
  );
}
