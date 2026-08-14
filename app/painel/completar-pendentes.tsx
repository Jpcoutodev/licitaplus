"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { criarClientNavegador } from "@/lib/supabase/client";

/**
 * Completa no PNCP as licitações da página que estão sem prazo ou sem valor.
 *
 * O job `completar-pendentes` varre o acervo de 5 em 5 minutos, mas quem está
 * olhando um cartão agora não deve esperar a próxima rodada. Aqui é só o que
 * está na tela, no máximo seis por carregamento, e uma vez por licitação por
 * sessão — se o PNCP não publicou os prazos, não adianta insistir a cada
 * navegação.
 *
 * Não renderiza nada: o resultado aparece nos próprios cartões, depois do
 * refresh.
 */

/** Compartilhado entre montagens: navegar entre abas não repete o trabalho. */
const jaTentadas = new Set<string>();

const MAX_POR_CARGA = 6;

export function CompletarPendentes({ ids }: { ids: string[] }) {
  const roteador = useRouter();
  const [rodando, setRodando] = useState(false);
  const emAndamento = useRef(false);

  useEffect(() => {
    if (emAndamento.current) return;
    const alvos = ids
      .filter((id) => !jaTentadas.has(id))
      .slice(0, MAX_POR_CARGA);
    if (alvos.length === 0) return;

    let ativo = true;
    emAndamento.current = true;
    setRodando(true);

    async function completar() {
      const supabase = criarClientNavegador();
      for (const id of alvos) jaTentadas.add(id);

      const resultados = await Promise.all(
        alvos.map(async (id) => {
          try {
            const { data } = await supabase.functions.invoke(
              "completar-licitacao",
              { body: { licitacao_id: id } },
            );
            return Boolean((data as { atualizado?: boolean })?.atualizado);
          } catch {
            return false;
          }
        }),
      );

      emAndamento.current = false;
      if (!ativo) return;
      setRodando(false);
      // Só recarrega se algo mudou de fato (evita laço de refresh).
      if (resultados.some(Boolean)) roteador.refresh();
    }
    void completar();

    return () => {
      ativo = false;
    };
  }, [ids, roteador]);

  if (!rodando) return null;
  return (
    <p className="texto-suave aviso-completando">
      Buscando prazos e valores no PNCP...
    </p>
  );
}
