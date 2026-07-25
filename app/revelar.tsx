"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Revela o conteúdo quando ele entra na tela (movimento discreto de baixo para
 * cima). Sem biblioteca — só IntersectionObserver.
 *
 * `lista`: em vez de animar a caixa inteira, anima os filhos em cascata (útil
 * para grades de cartões). O elemento continua sendo a própria grade, então dá
 * para passar as classes de layout normalmente.
 */
export function Revelar({
  children,
  lista = false,
  className = "",
  id,
}: {
  children: React.ReactNode;
  lista?: boolean;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      setVisivel(true);
      return;
    }

    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setVisivel(true);
          observador.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 },
    );

    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const base = lista ? "revelar-lista" : "revelar";

  return (
    <div
      ref={ref}
      id={id}
      className={`${base}${visivel ? " revelado" : ""}${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}
