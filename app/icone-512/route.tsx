import { ImageResponse } from "next/og";

export const runtime = "edge";

/** Ícone do PWA 512×512 (maskable-safe). */
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
          fontSize: 256,
          fontWeight: 800,
          fontFamily: "sans-serif",
          letterSpacing: -10,
        }}
      >
        L+
      </div>
    ),
    { width: 512, height: 512 },
  );
}
