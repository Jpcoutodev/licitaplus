"use client";

import { useEffect } from "react";

/**
 * Rastreio de visualização e conversão da página, com impacto mínimo de
 * performance: dispara uma visualização ao montar e captura cliques em
 * qualquer elemento com [data-cta-teste] como conversão. Usa navigator.
 * sendBeacon (fire-and-forget, não bloqueia navegação). Único JS de cliente
 * do artigo — os CTAs continuam sendo links estáticos.
 */
export function Rastreio({ caminho }: { caminho: string }) {
  useEffect(() => {
    const sessao = obterSessao();

    const enviar = (tipo: "visualizacao" | "conversao") => {
      const dados = JSON.stringify({
        tipo,
        caminho,
        sessao,
        referer: document.referrer || null,
      });
      const url = "/api/evento";
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([dados], { type: "application/json" }));
      } else {
        fetch(url, { method: "POST", body: dados, keepalive: true });
      }
    };

    enviar("visualizacao");

    const aoClicar = (evento: MouseEvent) => {
      const alvo = evento.target as HTMLElement | null;
      if (alvo?.closest("[data-cta-teste]")) enviar("conversao");
    };
    document.addEventListener("click", aoClicar);
    return () => document.removeEventListener("click", aoClicar);
  }, [caminho]);

  return null;
}

/** ID de sessão anônimo (só para contar visitantes únicos; não identifica ninguém). */
function obterSessao(): string {
  try {
    const chave = "lp_sessao";
    let s = localStorage.getItem(chave);
    if (!s) {
      s = crypto.randomUUID();
      localStorage.setItem(chave, s);
    }
    return s;
  } catch {
    return "anon";
  }
}
