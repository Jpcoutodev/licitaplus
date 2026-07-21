/**
 * Marca do SentinelaGov: quadrado azul com um escudo branco (a sentinela que
 * vigia) e uma seta verde de crescimento dentro (as vendas que sobem).
 * SVG inline — nítido em qualquer tamanho, sem imagem externa.
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
        <linearGradient id="sg-azul" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
        <linearGradient id="sg-verde" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#16a34a" />
          <stop offset="1" stopColor="#4ade80" />
        </linearGradient>
      </defs>

      <rect x="2" y="2" width="36" height="36" rx="11" fill="url(#sg-azul)" />

      {/* escudo da sentinela — sólido, para ler bem até em 16px */}
      <path
        d="M20 8.5 L30.5 12 V20.2 C30.5 25.8 26 30.2 20 32 C14 30.2 9.5 25.8 9.5 20.2 V12 Z"
        fill="#ffffff"
      />

      {/* seta de crescimento, dentro do escudo */}
      <path
        d="M15.5 23.5 L24 16"
        stroke="url(#sg-verde)"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M19.5 16 H24 V20.5"
        stroke="url(#sg-verde)"
        strokeWidth="2.8"
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
      <span className="marca-nome">SentinelaGov</span>
    </span>
  );
}
