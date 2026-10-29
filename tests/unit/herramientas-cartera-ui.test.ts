import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { alertasCopy, alertasText } from "@/content/i18n/extra-alertas";
import { extraCartera2, carteraUi, type CarteraUi } from "@/content/i18n/extra-cartera2";

const root = path.resolve(__dirname, "..", "..");

function read(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

const ADVICE = /compra|vende|\bbuy\b|\bsell\b|guaranteed|risk-free|risk free/;

describe("pulido de cartera", () => {
  const screen = read("app/(platform)/app/cartera/portfolio-screen.tsx");

  it("resume en grilla 2x2, con un solo aviso y sin repetir el total", () => {
    expect(screen).toContain("grid-cols-2 gap-3");
    expect(screen).toContain("min-h-36");
    expect(screen).toContain("h-36 w-full rounded-2xl");
    expect(screen).not.toContain("lg:grid-cols-3");
    expect(screen).not.toContain("t.portfolio.total");
    expect(screen).not.toContain("t.portfolio.pnl");
    expect(screen).toContain("summaryTip");
    expect(screen).toContain("tabular-nums");
    expect(screen).toContain("{t.portfolio.positions}");
    expect(screen).toContain("{t.portfolio.available}");
    expect(screen).toContain("{t.portfolio.history}");
    expect(screen).toContain("divide-border/60");
  });

  it("los textos nuevos coinciden en los dos idiomas y no aconsejan", () => {
    expect(Object.keys(extraCartera2.esCL).sort()).toEqual(Object.keys(extraCartera2.en).sort());
    for (const key of Object.keys(extraCartera2.esCL) as (keyof CarteraUi)[]) {
      expect(extraCartera2.esCL[key].length).toBeGreaterThan(0);
      expect(extraCartera2.en[key].length).toBeGreaterThan(0);
    }
    expect(carteraUi("es-CL").onChart).toBe("Punto del gráfico");
    expect(carteraUi("en")).toBe(extraCartera2.en);
    expect(JSON.stringify(extraCartera2)).not.toMatch(ADVICE);
  });
});

describe("pulido de favoritas y avisos", () => {
  const screen = read("app/(platform)/app/favoritas/favoritas-screen.tsx");
  const panel = read("components/domain/alert-panel.tsx");

  it("el orden es un segmentado compacto y la fila trae campana", () => {
    expect(screen).toContain("compact");
    expect(screen).not.toContain("fullWidth");
    expect(screen).toContain("AlertButton");
    expect(screen).toContain("Sparkline");
    expect(screen).toContain("h-[6.75rem] w-full rounded-2xl sm:h-14");
    expect(alertasText("es-CL").emptyAction).toBe("Explorar mercado");
    expect(alertasText("es-CL").sortChange).toBe("Cambio");
  });

  it("borrar pide confirmación y el tope de 20 queda visible", () => {
    expect(panel).toContain("confirmTitle");
    expect(panel).toContain("Dialog");
    expect(panel).toContain("capCount");
    expect(panel).toContain("ACTIVE_ALERT_CAP");
    expect(alertasText("es-CL").capCount).toContain("{max}");
    expect(alertasText("es-CL").confirmBody).toContain("{symbol}");
    expect(Object.keys(alertasCopy.esCL).sort()).toEqual(Object.keys(alertasCopy.en).sort());
    const blob = `${JSON.stringify(alertasCopy)} ${screen} ${panel}`;
    expect(blob.toLowerCase()).not.toMatch(/compra|vende|\bbuy\b|\bsell\b|consenso/);
  });
});
