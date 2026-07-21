import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "SentinelaGov — as licitações certas para a sua empresa";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Imagem de compartilhamento (Open Graph/Twitter). Self-contained: só cores e
// texto, sem fonte ou imagem externa (respeita a CSP e evita dependências).
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 55%, #3b82f6 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>
          SentinelaGov
        </div>
        <div
          style={{
            fontSize: 68,
            fontWeight: 800,
            lineHeight: 1.1,
            marginTop: 28,
            maxWidth: 900,
            letterSpacing: -2,
          }}
        >
          As licitações certas para a sua empresa, todo dia no seu email.
        </div>
        <div style={{ fontSize: 34, marginTop: 32, opacity: 0.92 }}>
          Alertas + análise com IA · Teste grátis por 14 dias
        </div>
      </div>
    ),
    { ...size },
  );
}
