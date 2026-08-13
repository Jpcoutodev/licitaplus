"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { abasDoUsuario, Icone, type Papel } from "./abas";
import { IconeSair } from "./nav";

/**
 * Menu ☰ do celular. A barra inferior leva as cinco abas do dia a dia; aqui
 * fica a lista inteira — Chamados, Configurações e as ferramentas internas da
 * equipe, que antes no celular só eram alcançáveis digitando a URL.
 */
export function MenuMobile({
  papel = "cliente",
  nomeEmpresa,
  email,
}: {
  papel?: Papel;
  nomeEmpresa: string | null;
  email: string | null;
}) {
  const rotaAtual = usePathname();
  const [aberto, setAberto] = useState(false);
  const abas = abasDoUsuario(papel);

  // Navegar fecha o menu (o Link não desmonta este componente).
  useEffect(() => setAberto(false), [rotaAtual]);

  // Com o menu aberto o fundo não rola — senão o dedo arrasta a página atrás.
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAberto(false);
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  return (
    <>
      <button
        type="button"
        className="botao-menu"
        onClick={() => setAberto(true)}
        aria-label="Abrir menu"
        aria-expanded={aberto}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {/* Portal para o body: o topo do celular é sticky com z-index próprio, e
          de dentro dele a gaveta ficaria por baixo da barra inferior. */}
      {aberto && createPortal(
        <div className="menu-fundo" onClick={() => setAberto(false)}>
          {/* O clique dentro da gaveta não deve fechá-la. */}
          <div
            className="menu-gaveta"
            role="dialog"
            aria-label="Menu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="menu-topo">
              <span className="menu-empresa">
                <strong>{nomeEmpresa ?? "Minha empresa"}</strong>
                {email && <span className="texto-suave">{email}</span>}
              </span>
              <button
                type="button"
                className="botao-menu"
                onClick={() => setAberto(false)}
                aria-label="Fechar menu"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <nav className="menu-lista">
              {abas.map((aba) => (
                <Link
                  key={aba.rota}
                  href={aba.rota}
                  className={`item-nav ${
                    rotaAtual === aba.rota ? "item-nav-ativo" : ""
                  }`}
                >
                  <Icone desenho={aba.icone} />
                  <span>{aba.nome}</span>
                </Link>
              ))}
            </nav>

            <form action="/auth/sair" method="post" className="menu-rodape">
              <button type="submit" className="item-nav">
                <IconeSair />
                <span>Sair</span>
              </button>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
