import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { en } from "@/content/i18n/en";
import { esCL } from "@/content/i18n/es-CL";
import { navExtra, navExtraCopy } from "@/content/i18n/extra-nav";
import {
  activeMobileTab,
  isShellSectionActive,
  mobileTabs,
  nextTabBarHidden,
  shellNav,
  shellTabLabel,
} from "@/components/app-shell/nav";

const ROOT = process.cwd();

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

describe("barra inferior liquid glass", () => {
  it("cinco destinos en orden, con Asistente al centro y sin Perfil ni Ajustes", () => {
    expect(mobileTabs.map((item) => item.id)).toEqual([
      "market",
      "portfolio",
      "assistant",
      "favorites",
      "wallet",
    ]);
    expect(mobileTabs.map((item) => item.href)).toEqual([
      "/app",
      "/app/cartera",
      "/app/asistente",
      "/app/favoritas",
      "/app/billetera",
    ]);
    expect(mobileTabs[2]?.id).toBe("assistant");
  });

  it("el sidebar recibe Asistente por shellNav y Perfil sigue en el arreglo", () => {
    expect(shellNav.map((item) => item.href)).toEqual([
      "/app",
      "/app/cartera",
      "/app/asistente",
      "/app/favoritas",
      "/app/billetera",
      "/app/perfil",
    ]);
  });

  it("marca una sola sección y no confunde /app con el resto", () => {
    expect(isShellSectionActive("/app", "market")).toBe(true);
    expect(isShellSectionActive("/app/accion/AAPLx", "market")).toBe(true);
    expect(isShellSectionActive("/app/asistente", "market")).toBe(false);
    expect(isShellSectionActive("/app/favoritas", "market")).toBe(false);
    expect(isShellSectionActive("/app/asistente", "assistant")).toBe(true);
    expect(isShellSectionActive("/app/asistente/hilo", "assistant")).toBe(true);
    expect(isShellSectionActive("/app/favoritas", "favorites")).toBe(true);
    expect(isShellSectionActive("/app/cartera", "portfolio")).toBe(true);
    expect(isShellSectionActive("/app/billetera", "wallet")).toBe(true);
    expect(isShellSectionActive("/app/perfil/cuenta", "profile")).toBe(true);
    expect(isShellSectionActive("/app/ajustes", "wallet")).toBe(false);
    expect(isShellSectionActive("/app/ajustes", "profile")).toBe(false);
    expect(activeMobileTab("/app/asistente")).toBe(2);
    expect(activeMobileTab("/app/perfil")).toBe(-1);
    expect(activeMobileTab("/app/ajustes")).toBe(-1);
  });

  it("esconde al bajar, muestra al subir y no se mueve con un temblor", () => {
    expect(nextTabBarHidden(false, 0, 4)).toBe(false);
    expect(nextTabBarHidden(true, 80, 4)).toBe(false);
    expect(nextTabBarHidden(false, 60, 80)).toBe(true);
    expect(nextTabBarHidden(true, 200, 180)).toBe(false);
    expect(nextTabBarHidden(true, 200, 196)).toBe(true);
    expect(nextTabBarHidden(false, 200, 206)).toBe(false);
  });

  it("publica etiquetas cortas en los dos idiomas, también para el sidebar", () => {
    expect(navExtraCopy("es-CL")).toEqual(navExtra.esCL);
    expect(navExtraCopy("en")).toEqual(navExtra.en);
    for (const copy of [navExtra.esCL, navExtra.en]) {
      expect(copy.assistant.length).toBeGreaterThan(0);
      expect(copy.assistant.length).toBeLessThanOrEqual(12);
      expect(copy.favorites.length).toBeLessThanOrEqual(12);
    }
    const es = esCL.nav as Record<string, string>;
    const enNav = en.nav as Record<string, string>;
    expect(es.assistant).toBe("Asistente");
    expect(es.favorites).toBe("Favoritas");
    expect(enNav.assistant).toBe("Assistant");
    expect(enNav.favorites).toBe("Favorites");
    expect(shellTabLabel("es-CL", "assistant", esCL.nav)).toBe("Asistente");
    expect(shellTabLabel("en", "wallet", en.nav)).toBe("Wallet");
    expect(shellTabLabel("es-CL", "market", esCL.nav)).toBe("Mercado");
  });

  it("el JSX declara navegación, foco, vidrio y el alto que no tapa el contenido", () => {
    const tabs = readRepoFile("components/app-shell/bottom-tabs.tsx");
    const shell = readRepoFile("components/app-shell/app-shell.tsx");
    expect(tabs).toContain('import "./liquid-glass.css"');
    expect(tabs).toContain('role="navigation"');
    expect(tabs).toContain("aria-label={t.nav.label}");
    expect(tabs).toContain('aria-current={active ? "page" : undefined}');
    expect(tabs).toContain("data-hidden");
    expect(tabs).toContain("nextTabBarHidden");
    expect(tabs).toContain("md:hidden");
    expect(tabs).toContain("env(safe-area-inset-bottom)");
    expect(tabs).toContain("backdrop-blur-xl");
    expect(tabs).toContain("border-border/70");
    expect(tabs).toContain("(min-width: 1024px)");
    expect(tabs).toContain("offsetHeight");
    expect(shell).toContain("pb-[var(--app-tabs-height)]");
    expect(shell).toContain("lg:pb-0");
  });

  it("el CSS tiene vidrio, fallback, brillo, píldora y movimiento reducido", () => {
    const css = readRepoFile("components/app-shell/liquid-glass.css");
    expect(css).toContain("backdrop-filter: saturate(180%) blur(22px)");
    expect(css).toContain("@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))");
    expect(css).toContain("linear-gradient");
    expect(css).toContain("--tab-index");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("prefers-reduced-transparency: reduce");
    expect(css).toContain("forced-colors: active");
    expect(css).toContain("light-dark(");
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain(".dark");
    expect(css).toContain("max-width: 63.99rem");
    expect(css).toContain(":focus-visible");
  });
});
