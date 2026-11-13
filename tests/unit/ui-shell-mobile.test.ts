import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

describe("UI Shell & Mobile Broker Header (x.ai/bot light aesthetic)", () => {
  it("TopBar móvil es un cluster flotante Liquid Glass (avatar + buscador), sin barra ancha ni título", () => {
    const src = readRepoFile("components/app-shell/top-bar.tsx");
    expect(src).not.toContain("<BrandMark");
    expect(src).not.toContain("<header");
    expect(src).not.toContain("sectionTitle");
    expect(src).toContain("fixed");
    expect(src).toContain("env(safe-area-inset-top)");
    expect(src).toContain("StockSearchButton");
    expect(src).toContain("lg:hidden");
    expect(src).toContain("/app/perfil");
  });

  it("El chip flotante tiene estilos Liquid Glass al final de liquid-glass.css y CurrencySwitch vive en el perfil", () => {
    const css = readRepoFile("components/app-shell/liquid-glass.css");
    expect(css).toContain("/* === floating chips (Agent C) === */");
    expect(css).toContain(".liquid-glass--chip");
    expect(css).toContain("backdrop-filter");
    expect(readRepoFile("components/app-shell/stock-search.tsx")).toContain('"chip"');
    expect(readRepoFile("app/(platform)/app/perfil/profile-screen.tsx")).toContain("CurrencySwitch");
  });
  it("PublicHeader usa BrandMark con compactOnMobile en móvil y acabado translúcido", () => {
    const src = readRepoFile("components/app-shell/public-header.tsx");
    expect(src).toContain("<BrandMark compactOnMobile");
    expect(src).toContain("backdrop-blur-xl");
    expect(src).toContain("border-border/70");
  });

  it("BrandMark con compactOnMobile oculta BrandLogoImage en móvil (< md) y muestra BrandFavicon compacto", () => {
    const src = readRepoFile("components/app-shell/brand-mark.tsx");
    expect(src).toContain("compactOnMobile");
    expect(src).toContain("md:hidden");
    expect(src).toContain("hidden md:block");
    expect(src).toContain("BrandFavicon");
  });

  it("BottomTabs usa vidrio esmerilado backdrop-blur-xl y borde hairline border-border/70", () => {
    const src = readRepoFile("components/app-shell/bottom-tabs.tsx");
    expect(src).toContain("backdrop-blur-xl");
    expect(src).toContain("border-border/70");
    expect(src).toContain("aria-label={t.nav.label}");
  });

  it("Sidebar y AppShell conservan accesibilidad skip-link y aplican bordes sutiles", () => {
    const sidebar = readRepoFile("components/app-shell/sidebar.tsx");
    const shell = readRepoFile("components/app-shell/app-shell.tsx");
    expect(sidebar).toContain("border-border");
    expect(shell).toContain('id="contenido"');
    expect(shell).toContain("tabIndex={-1}");
  });

  it("globals.css conserva contraste WCAG 2.2 AA (#66696e) y define .no-scrollbar y --shadow-card", () => {
    const css = readRepoFile("app/globals.css");
    expect(css).toContain("--color-fg-muted: #5b5e63");
    expect(css).toContain("no-scrollbar");
    expect(css).toContain("--shadow-card");
  });

  it("Card, PageHeader, SegmentedControl y Badge aplican acabado refinado", () => {
    const card = readRepoFile("components/ui/card.tsx");
    const header = readRepoFile("components/ui/page-header.tsx");
    const seg = readRepoFile("components/ui/segmented-control.tsx");
    const badge = readRepoFile("components/ui/badge.tsx");
    expect(card).toContain("border-border");
    expect(header).toContain("tracking-tight");
    expect(seg).toContain("border-control");
    expect(badge).toContain("rounded-full");
  });
});
