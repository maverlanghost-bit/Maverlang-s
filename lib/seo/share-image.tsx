import { site } from "@/config/site";

export const shareImageSize = {
  width: 1200,
  height: 630,
} as const;

export const shareImageAlt = `${site.name}: acciones de EE.UU. tokenizadas, con pesos.`;

export function ShareImage() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#ffffff",
        color: "#0a0a0a",
        padding: "72px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            background: "#ff6a08",
            marginRight: 16,
          }}
        />
        <div style={{ display: "flex", fontSize: 32 }}>{site.name}</div>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 68,
          lineHeight: 1.05,
          letterSpacing: -1,
          maxWidth: 980,
        }}
      >
        Acciones de EE.UU. tokenizadas, en tu billetera
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 28, color: "#252525" }}>
          Fracciones desde $1.000, en Solana, pagando con pesos.
        </div>
        <div style={{ display: "flex", fontSize: 24, color: "#6c6f75", marginTop: 12 }}>
          No otorgan derechos de accionista.
        </div>
      </div>
    </div>
  );
}
