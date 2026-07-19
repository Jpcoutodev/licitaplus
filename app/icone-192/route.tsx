import { ImageResponse } from "next/og";

export const runtime = "edge";

/** Ícone do PWA 192×192 (maskable-safe: marca centrada sobre fundo cheio). */
export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #2563eb 0%, #1d4ed8 55%, #16a34a 130%)",
          color: "#ffffff",
          fontSize: 96,
          fontWeight: 800,
          fontFamily: "sans-serif",
          letterSpacing: -4,
        }}
      >
        L+
      </div>
    ),
    { width: 192, height: 192 },
  );
}
