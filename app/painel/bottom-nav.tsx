"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { abasDaBarra, Icone, type Papel } from "./abas";

/** Barra de navegação inferior (só no celular) — estilo app. */
export function BottomNav({ papel = "cliente" }: { papel?: Papel }) {
  const rotaAtual = usePathname();
  // Só as cinco do dia a dia; o resto está no menu ☰ do topo.
  const abas = abasDaBarra(papel);

  return (
    <nav className="bottom-nav" aria-label="Navegação">
      {abas.map((aba) => {
        const ativo = rotaAtual === aba.rota;
        return (
          <Link
            key={aba.rota}
            href={aba.rota}
            className={`bottom-nav-item ${ativo ? "bottom-nav-ativo" : ""}`}
            aria-current={ativo ? "page" : undefined}
          >
            <Icone desenho={aba.icone} />
            <span>{aba.curto}</span>
          </Link>
        );
      })}
    </nav>
  );
}
