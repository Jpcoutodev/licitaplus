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
}

const ABAS: Aba[] = [
  {
    rota: "/painel",
    nome: "Painel",
    curto: "Painel",
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
    icone: (
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    ),
  },
  {
    rota: "/painel/analise",
    nome: "Análise IA",
    curto: "IA",
    icone: (
      <>
        <path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" />
        <path d="M9.5 11.5h.01M13 11.5h.01M16.5 11.5h.01" strokeWidth="2.4" />
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

export function abasDoUsuario(admin: boolean): Aba[] {
  return admin ? [...ABAS, ABA_METRICAS] : ABAS;
}
