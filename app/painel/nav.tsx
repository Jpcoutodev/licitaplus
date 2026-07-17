"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ABAS = [
  { rota: "/painel", nome: "Painel" },
  { rota: "/painel/perfil", nome: "Perfil de busca" },
  { rota: "/painel/favoritos", nome: "Favoritos" },
  { rota: "/painel/analise", nome: "Análise IA" },
  { rota: "/painel/configuracoes", nome: "Configurações" },
];

export function NavPainel() {
  const rotaAtual = usePathname();

  return (
    <nav className="abas">
      {ABAS.map((aba) => (
        <Link
          key={aba.rota}
          href={aba.rota}
          className={`aba ${rotaAtual === aba.rota ? "aba-ativa" : ""}`}
        >
          {aba.nome}
        </Link>
      ))}
    </nav>
  );
}
