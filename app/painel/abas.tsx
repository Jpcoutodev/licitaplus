/** Abas do painel, compartilhadas pela sidebar (desktop) e pela barra inferior (mobile). */

export function Icone({ desenho }: { desenho: React.ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {desenho}
    </svg>
  );
}

export interface Aba {
  rota: string;
  nome: string;
  curto: string;
  icone: React.ReactNode;
  /**
   * Aparece na barra inferior do celular. Cabem cinco com o rótulo legível numa
   * tela de 375px; o resto vive no menu ☰ do topo, que lista tudo.
   */
  barra?: boolean;
}

const ABAS: Aba[] = [
  {
    rota: "/painel",
    nome: "Painel",
    curto: "Painel",
    barra: true,
    icone: (
      <>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </>
    ),
  },
  {
    rota: "/painel/perfil",
    nome: "Perfil de busca",
    curto: "Perfil",
    barra: true,
    icone: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </>
    ),
  },
  {
    rota: "/painel/favoritos",
    nome: "Favoritos",
    curto: "Favoritos",
    barra: true,
    icone: (
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    ),
  },
  {
    rota: "/painel/analise",
    nome: "Análise IA",
    curto: "IA",
    barra: true,
    icone: (
      <>
        <path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" />
        <path d="M9.5 11.5h.01M13 11.5h.01M16.5 11.5h.01" strokeWidth="2.4" />
      </>
    ),
  },
  {
    rota: "/painel/licitando",
    nome: "Licitando",
    curto: "Licitando",
    barra: true,
    icone: (
      <>
        <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
        <path d="M8 3v3M16 3v3M3 10h18" />
        <path d="m8.8 14.8 2 2 3.9-3.9" />
      </>
    ),
  },
  {
    rota: "/painel/chamados",
    nome: "Chamados",
    curto: "Suporte",
    icone: (
      <>
        <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
        <rect x="2.5" y="12.5" width="4" height="6.5" rx="1.4" />
        <rect x="17.5" y="12.5" width="4" height="6.5" rx="1.4" />
        <path d="M20 19a3.5 3.5 0 0 1-3.5 3H13" />
      </>
    ),
  },
  {
    rota: "/painel/configuracoes",
    nome: "Configurações",
    curto: "Config",
    icone: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
      </>
    ),
  },
];

const ABA_METRICAS: Aba = {
  rota: "/painel/metricas",
  nome: "Métricas",
  curto: "Métricas",
  icone: (
    <>
      <path d="M3 3v18h18" />
      <rect x="7" y="12" width="3" height="5" />
      <rect x="12" y="8" width="3" height="9" />
      <rect x="17" y="5" width="3" height="12" />
    </>
  ),
};

/** Prospecção interna. Mora em /admin, fora do fluxo do cliente. */
const ABA_LEADS: Aba = {
  rota: "/admin/leads",
  nome: "Leads",
  curto: "Leads",
  icone: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </>
  ),
};

/**
 * Papel da conta no sistema (espelha `admins.papel`, mais o cliente comum).
 * O testador usa tudo sem limites, menos Métricas — os números do negócio.
 */
export type Papel = "cliente" | "testador" | "admin";

/**
 * Todas as abas do usuário, na ordem do menu. É o que a sidebar do desktop e o
 * menu ☰ do celular mostram — inclusive as internas, que antes no celular só
 * eram alcançáveis digitando a URL.
 */
export function abasDoUsuario(papel: Papel): Aba[] {
  if (papel === "cliente") return ABAS;
  if (papel === "testador") return [...ABAS, ABA_LEADS];
  return [...ABAS, ABA_METRICAS, ABA_LEADS];
}

/**
 * Abas da barra inferior do celular: as cinco do dia a dia. Chamados e
 * Configurações (e as internas, que são de uso em desktop — tabela larga,
 * exportação, edição de ficha) ficam no menu ☰.
 */
export function abasDaBarra(papel: Papel): Aba[] {
  return abasDoUsuario(papel).filter((aba) => aba.barra);
}
