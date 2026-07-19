"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { abasDoUsuario, Icone } from "./abas";

export function NavPainel({ admin = false }: { admin?: boolean }) {
  const rotaAtual = usePathname();
  const abas = abasDoUsuario(admin);

  return (
    <nav className="sidebar-nav">
      {abas.map((aba) => (
        <Link
          key={aba.rota}
          href={aba.rota}
          className={`item-nav ${rotaAtual === aba.rota ? "item-nav-ativo" : ""}`}
          title={aba.nome}
        >
          <Icone desenho={aba.icone} />
          <span className="texto-nav">{aba.nome}</span>
        </Link>
      ))}
    </nav>
  );
}

export function IconeSair() {
  return (
    <Icone
      desenho={
        <>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="m16 17 5-5-5-5" />
          <path d="M21 12H9" />
        </>
      }
    />
  );
}
