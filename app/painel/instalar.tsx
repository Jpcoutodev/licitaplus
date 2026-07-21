"use client";

import { useEffect, useState } from "react";

interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

/**
 * Registra o service worker (habilita PWA + push) e mostra, só dentro do
 * painel, um convite discreto para instalar o app. Dispensável e não repete
 * depois de instalado ou recusado.
 */
export function InstalarApp() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [visivel, setVisivel] = useState(false);
  const [ehIOS, setEhIOS] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    // Já instalado (standalone)? Não convida.
    const instalado = window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (instalado || localStorage.getItem("lp_instalar_dispensado") === "1") {
      return;
    }

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setEhIOS(ios);

    const aoPrompt = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalar);
      setVisivel(true);
    };
    window.addEventListener("beforeinstallprompt", aoPrompt);

    // iOS não dispara beforeinstallprompt: mostramos a dica manual.
    if (ios) setVisivel(true);

    return () => window.removeEventListener("beforeinstallprompt", aoPrompt);
  }, []);

  function dispensar() {
    setVisivel(false);
    localStorage.setItem("lp_instalar_dispensado", "1");
  }

  async function instalar() {
    if (!evento) return;
    await evento.prompt();
    await evento.userChoice;
    setVisivel(false);
    setEvento(null);
  }

  if (!visivel) return null;

  return (
    <div className="banner-instalar">
      <div className="banner-instalar-texto">
        <strong>Instale o app do SentinelaGov</strong>
        <span className="texto-suave">
          {ehIOS
            ? "Toque em Compartilhar e depois em “Adicionar à Tela de Início”."
            : "Acesso rápido na tela inicial e notificações das suas licitações."}
        </span>
      </div>
      <div className="banner-instalar-acoes">
        {!ehIOS && evento && (
          <button type="button" className="botao" onClick={instalar}>
            Instalar
          </button>
        )}
        <button type="button" className="botao-fantasma" onClick={dispensar}>
          Agora não
        </button>
      </div>
    </div>
  );
}
