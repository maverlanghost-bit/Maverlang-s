import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * W5 UI broker pro: guarda la estética móvil (x.ai/bot light) de las
 * pantallas de la plataforma sin romper los guardrailes existentes:
 *
 * - memo(TickerRowInner, sameRow) exigido por tests/unit/perf-static.test.ts.
 * - LazyPriceChart y data-range en detalle y cartera (perf-static + e2e).
 * - Headings, aria-label, role="radiogroup"/"radio" y data-range que leen
 *   e2e/market.spec.ts, e2e/detail.spec.ts, e2e/demo-trade.spec.ts,
 *   e2e/deposit.spec.ts y e2e/a11y.spec.ts.
 * - Clases responsivas móviles de la tira de filtros y las cápsulas.
 */

const ROOT = path.resolve(__dirname, "..", "..");

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

const tickerRow = read("components/domain/ticker-row.tsx");
const changeBadge = read("components/domain/change-badge.tsx");
const marketStatusPill = read("components/domain/market-status-pill.tsx");
const marketScreen = read("app/(platform)/app/market-screen.tsx");
const detailScreen = read("app/(platform)/app/accion/[ticker]/detail-screen.tsx");
const pricePanel = read("app/(platform)/app/accion/[ticker]/price-panel.tsx");
const portfolioScreen = read("app/(platform)/app/cartera/portfolio-screen.tsx");
const walletScreen = read("app/(platform)/app/billetera/wallet-screen.tsx");

describe("W5: memoización y carga diferida intactas (perf-static)", () => {
  it("TickerRow sigue memoizado con el comparador por contenido sameRow", () => {
    expect(tickerRow).toContain("export const TickerRow = memo(");
    expect(tickerRow).toContain("sameRow");
    expect(tickerRow).toContain('loading="lazy"');
    expect(tickerRow).toContain('sizes="40px"');
  });

  it("la ficha y la cartera conservan LazyPriceChart (carga diferida del gráfico)", () => {
    expect(pricePanel).toContain("LazyPriceChart");
    expect(portfolioScreen).toContain("LazyPriceChart");
    // El rango activo del panel queda expuesto como data-range (e2e/detail).
    expect(pricePanel).toContain("data-range={range}");
  });
});

describe("W5: accesibilidad de la ficha (detail.spec, a11y.spec)", () => {
  it("el selector de rangos es un group con el aria-label exacto y botones", () => {
    // Reemplaza a SegmentedControl sin perder el contrato de e2e:
    // role="group" + aria-label "Rango del gráfico" (t.detail.rangesLabel).
    expect(pricePanel).toContain('role="group"');
    expect(pricePanel).toContain("aria-label={label}");
    expect(pricePanel).toContain("t.detail.rangesLabel");
    // Los botones de rango siguen siendo botones con estado presionado.
    expect(pricePanel).toContain("aria-pressed={selected}");
    // El import del SegmentedControl ya no existe (cápsula propia del broker).
    expect(pricePanel).not.toContain('import { SegmentedControl }');
    expect(pricePanel).not.toContain("@/components/ui/segmented-control");
  });

  it("la ficha conserva los headings y textos que busca el e2e", () => {
    expect(detailScreen).toContain("{t.detail.position}");
    expect(detailScreen).toContain("{t.detail.actions}");
    expect(detailScreen).toContain("{t.detail.stats}");
    expect(detailScreen).toContain("{t.detail.aboutTitle}");
    expect(detailScreen).toContain("{t.detail.tokenTitle}");
    expect(detailScreen).toContain("{t.detail.buy}");
    expect(detailScreen).toContain("{t.detail.sell}");
    expect(detailScreen).toContain("aria-label={t.detail.chips}");
  });

  it("la barra fija de compra/venta es lg:hidden con vidrio esmerilado", () => {
    // Móvil: barra pegajosa con backdrop-blur; desktop: la tarjeta lateral.
    expect(detailScreen).toMatch(/className="[^"]*lg:hidden[^"]*"/);
    expect(detailScreen).toMatch(/backdrop-blur-xl/);
  });
});

describe("W5: mercado móvil (market.spec)", () => {
  it("la tira de filtros es deslizable y oculta la scrollbar en móvil", () => {
    expect(marketScreen).toContain("overflow-x-auto");
    expect(marketScreen).toContain("[scrollbar-width:none]");
    expect(marketScreen).toContain("[&::-webkit-scrollbar]:hidden");
    expect(marketScreen).toContain("sm:flex-wrap");
  });

  it("los filtros siguen siendo radiogroup/radio con aria-checked", () => {
    expect(marketScreen).toContain('role="radiogroup"');
    expect(marketScreen).toContain('role="radio"');
    expect(marketScreen).toContain("aria-checked={selected}");
    // El rango activo marca la píldora activa con contraste alto.
    expect(marketScreen).toContain("bg-fg text-bg");
  });

  it("el contador de activos usa tipografía numérica tabular", () => {
    expect(marketScreen).toContain("tabular-nums");
    expect(marketScreen).toContain("t.market.stockCount");
  });
});

describe("W5: cartera y billetera ejecutivas (demo-trade, deposit)", () => {
  it("la cartera conserva los headings del e2e y el divisor sutil", () => {
    expect(portfolioScreen).toContain("{t.portfolio.available}");
    expect(portfolioScreen).toContain("{t.portfolio.history}");
    expect(portfolioScreen).toContain("{t.portfolio.positions}");
    expect(portfolioScreen).toContain("divide-border/60");
  });

  it("la billetera conserva accesos, dirección y actividad (deposit.spec)", () => {
    expect(walletScreen).toContain("href={DEPOSIT_HREF}");
    expect(walletScreen).toContain("href={SEND_HREF}");
    expect(walletScreen).toContain("href={RECEIVE_HREF}");
    expect(walletScreen).toContain("{t.wallet.assets}");
    expect(walletScreen).toContain("{t.wallet.activity}");
    expect(walletScreen).toContain('id="actividad"');
  });

  it("ChangeBadge y MarketStatusPill mantienen la píldora compacta legible", () => {
    expect(changeBadge).toContain("rounded-full");
    expect(changeBadge).toContain("tabular-nums");
    expect(changeBadge).toContain('sr-only">{word}');
    expect(marketStatusPill).toContain("rounded-full");
  });

  it("ningún texto visible usa fg-subtle (WCAG AA)", () => {
    const files = [tickerRow, changeBadge, marketStatusPill, marketScreen, detailScreen, pricePanel, portfolioScreen, walletScreen];
    for (const source of files) {
      expect(source, "no debe usar text-fg-subtle en texto visible").not.toContain("text-fg-subtle");
    }
  });
});
