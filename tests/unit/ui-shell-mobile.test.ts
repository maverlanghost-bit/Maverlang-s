import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

describe("UI Shell & Mobile Broker Header (x.ai/bot light aesthetic)", () => {
  it("TopBar móvil no renderiza el logo ancho BrandMark y muestra título contextual + CurrencySwitch + buscador", () => {
    const src = readRepoFile("components/app-shell/top-bar.tsx");
    expect(src).not.toContain("<BrandMark");
    expect(src).toContain("sectionTitle");
    expect(src).toContain("CurrencySwitch");
    expect(src).toContain("StockSearchButton");
    expect(src).toContain("backdrop-blur-xl");
    expect(src).toContain("border-border/70");
  });

  it("TopBar resuelve títulos contextuales para mercado, cartera, billetera, perfil, ajustes y ficha de acción", () => {
    const src = readRepoFile("components/app-shell/top-bar.tsx");
    expect(src).toContain("/^\\/app\\/accion\\/([^/]+)/");
    expect(src).toContain("t.nav.market");
    expect(src).toContain("t.nav.portfolio");
    expect(src).toContain("t.nav.wallet");
    expect(src).toContain("t.nav.profile");
    expect(src).toContain("t.nav.settings");
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
    expect(sidebar).toContain("border-border/70");
    expect(shell).toContain('id="contenido"');
    expect(shell).toContain("tabIndex={-1}");
  });

  it("globals.css conserva contraste WCAG 2.2 AA (#66696e) y define .no-scrollbar y --shadow-card", () => {
    const css = readRepoFile("app/globals.css");
    expect(css).toContain("--color-fg-muted: #66696e");
    expect(css).toContain("no-scrollbar");
    expect(css).toContain("--shadow-card");
  });

  it("Card, PageHeader, SegmentedControl y Badge aplican acabado refinado", () => {
    const card = readRepoFile("components/ui/card.tsx");
    const header = readRepoFile("components/ui/page-header.tsx");
    const seg = readRepoFile("components/ui/segmented-control.tsx");
    const badge = readRepoFile("components/ui/badge.tsx");
    expect(card).toContain("border-border/70");
    expect(header).toContain("tracking-tight");
    expect(seg).toContain("border-border/70");
    expect(badge).toContain("rounded-full");
  });
});
