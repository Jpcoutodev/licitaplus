/**
 * Marca do Licitaplus: quadrado azul com um "L" (eixo) e uma seta verde de
 * crescimento. SVG inline — nítido em qualquer tamanho, sem imagem externa.
 */
export function MarcaLogo({ tamanho = 32 }: { tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="lp-azul" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
        <linearGradient id="lp-verde" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#16a34a" />
          <stop offset="1" stopColor="#4ade80" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="36" height="36" rx="11" fill="url(#lp-azul)" />
      {/* eixo em L */}
      <path
        d="M13 10 V27 a2 2 0 0 0 2 2 H24"
        stroke="#ffffff"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* seta de crescimento */}
      <path
        d="M17 26 L31 14"
        stroke="url(#lp-verde)"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M24.5 14 H31 V20.5"
        stroke="url(#lp-verde)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/** Marca completa: ícone + nome. `claro` para fundos escuros (sidebar). */
export function Logo({
  claro = false,
  tamanho = 30,
}: {
  claro?: boolean;
  tamanho?: number;
}) {
  return (
    <span className={`marca${claro ? " marca-clara" : ""}`}>
      <MarcaLogo tamanho={tamanho} />
      <span className="marca-nome">Licitaplus</span>
    </span>
  );
}
