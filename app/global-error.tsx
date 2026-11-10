"use client";

import Link from "next/link";
import { useEffect, type CSSProperties } from "react";

import { site } from "@/config/site";

/**
 * Último recurso: se muestra si falla el layout raíz. Next no incluye
 * `app/globals.css` en este documento, así que el mínimo visual va en línea con
 * los tokens del design system (blanco, #0a0a0a, gris #7d8188, píldoras).
 * Nunca se muestra el mensaje técnico del error: sólo una salida.
 */
const bodyStyle: CSSProperties = {
  margin: 0,
  minHeight: "100dvh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
  background: "#ffffff",
  color: "#0a0a0a",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  lineHeight: 1.5,
};

const labelStyle: CSSProperties = {
  margin: 0,
  fontSize: "11px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#7d8188",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

const titleStyle: CSSProperties = {
  margin: "12px 0 0",
  fontSize: "1.75rem",
  lineHeight: 1.15,
  fontWeight: 500,
  letterSpacing: "-0.01em",
};

const copyStyle: CSSProperties = {
  margin: "12px 0 0",
  fontSize: "0.875rem",
  lineHeight: 1.6,
  color: "#252525",
};

const pill: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "44px",
  padding: "0 20px",
  borderRadius: "9999px",
  fontSize: "0.875rem",
  textDecoration: "none",
};

const primaryStyle: CSSProperties = { ...pill, background: "#0a0a0a", color: "#ffffff", border: "none" };
const secondaryStyle: CSSProperties = { ...pill, background: "#e1e1e1", color: "#0a0a0a", border: "none" };

export default function GlobalError({ error, reset }: { error: unknown; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es-CL">
      <body style={bodyStyle}>
        <title>{`Error · ${site.name}`}</title>
        <main style={{ width: "100%", maxWidth: "28rem" }}>
          <p style={labelStyle}>Error</p>
          <h1 style={titleStyle}>Algo salió mal</h1>
          <p style={copyStyle}>
            No pudimos cargar esta página. Vuelve a intentarlo en unos segundos.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "24px" }}>
            <button type="button" onClick={() => reset()} style={primaryStyle}>
              Reintentar
            </button>
            <Link href="/" style={secondaryStyle}>
              Volver al inicio
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
