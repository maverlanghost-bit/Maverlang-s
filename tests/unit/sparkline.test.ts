import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { armSparklineDraw, sparklinePath, sparklineTone } from "@/components/domain/sparkline";
import { isRealSparkHistory } from "@/lib/market/browse";

const ROOT = path.resolve(__dirname, "..", "..");
const DRAW = "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)";

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

function coords(d: string): Array<[number, number]> {
  return [...d.matchAll(/[ML] (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((match) => [
    Number(match[1]),
    Number(match[2]),
  ]);
}

class FakeObserver {
  static last: FakeObserver | null = null;
  static created = 0;
  disconnected = false;
  readonly callback: IntersectionObserverCallback;
  readonly options: IntersectionObserverInit | undefined;
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    FakeObserver.created += 1;
    FakeObserver.last = this;
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  readonly root: Element | Document | null = null;
  readonly rootMargin = "";
  readonly thresholds: readonly number[] = [];
  intersect(isIntersecting: boolean): void {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

function fakePath(length: number): SVGPathElement {
  return {
    style: { strokeDasharray: "", strokeDashoffset: "", transition: "" },
    getTotalLength: () => length,
  } as unknown as SVGPathElement;
}

const originalObserver = globalThis.IntersectionObserver;

afterEach(() => {
  FakeObserver.last = null;
  FakeObserver.created = 0;
  if (originalObserver) globalThis.IntersectionObserver = originalObserver;
  else Reflect.deleteProperty(globalThis, "IntersectionObserver");
});

describe("sparkline: trazo", () => {
  it("no arma path con menos de dos valores", () => {
    expect(sparklinePath([], 96, 32)).toBeNull();
    expect(sparklinePath([4], 96, 32)).toBeNull();
  });

  it("una serie plana queda horizontal y dentro del padding", () => {
    const d = sparklinePath([5, 5, 5], 100, 40);
    expect(d).toBe("M 2.0 38.0 L 50.0 38.0 L 98.0 38.0");
    const points = coords(d ?? "");
    expect(points[0]?.[0]).toBe(2);
    expect(points[2]?.[0]).toBe(98);
    expect(points.every(([, y]) => y === 38)).toBe(true);
  });

  it("un valor más alto queda más arriba (y menor)", () => {
    const d = sparklinePath([0, 10], 10, 10);
    expect(d).toBe("M 2.0 8.0 L 8.0 2.0");
    const points = coords(d ?? "");
    expect(points[1]?.[1]).toBeLessThan(points[0]?.[1] ?? 0);
  });

  it("asigna el tono según el primer y el último valor", () => {
    expect(sparklineTone([1, 2, 3])).toBe("text-up");
    expect(sparklineTone([3, 2, 1])).toBe("text-down");
    expect(sparklineTone([2, 4, 2])).toBe("text-fg-muted");
  });
});

describe("sparkline: entrada", () => {
  it("con movimiento reducido deja el trazo completo y no observa", () => {
    globalThis.IntersectionObserver = FakeObserver as unknown as typeof IntersectionObserver;
    const path = fakePath(80);
    const stop = armSparklineDraw(path, true);
    expect(stop).toBeUndefined();
    expect(FakeObserver.created).toBe(0);
    expect(path.style.strokeDasharray).toBe("none");
    expect(path.style.strokeDashoffset).toBe("0");
    expect(path.style.transition).toBe("none");
  });

  it("esconde el trazo y lo dibuja al cruzar el 20 % del viewport", () => {
    globalThis.IntersectionObserver = FakeObserver as unknown as typeof IntersectionObserver;
    const path = fakePath(80);
    const stop = armSparklineDraw(path, false);
    expect(FakeObserver.created).toBe(1);
    expect(FakeObserver.last?.options?.threshold).toBe(0.2);
    expect(path.style.strokeDasharray).toBe("80");
    expect(path.style.strokeDashoffset).toBe("80");
    expect(path.style.transition).toBe("none");

    FakeObserver.last?.intersect(false);
    expect(path.style.strokeDashoffset).toBe("80");
    expect(FakeObserver.last?.disconnected).toBe(false);

    FakeObserver.last?.intersect(true);
    expect(path.style.transition).toBe(DRAW);
    expect(path.style.strokeDashoffset).toBe("0");
    expect(FakeObserver.last?.disconnected).toBe(true);
    expect(typeof stop).toBe("function");
  });

  it("la limpieza desconecta el observer", () => {
    globalThis.IntersectionObserver = FakeObserver as unknown as typeof IntersectionObserver;
    const stop = armSparklineDraw(fakePath(40), false);
    expect(FakeObserver.last?.disconnected).toBe(false);
    stop?.();
    expect(FakeObserver.last?.disconnected).toBe(true);
  });
});

describe("sparkline: sólo historia real", () => {
  it("acepta ticks, closes o real, y rechaza mock", () => {
    expect(isRealSparkHistory(undefined)).toBe(false);
    expect(isRealSparkHistory(null)).toBe(false);
    expect(isRealSparkHistory({ source: "mock", real: false })).toBe(false);
    expect(isRealSparkHistory({ source: "mock", real: true })).toBe(false);
    expect(isRealSparkHistory({ source: "ticks", real: true })).toBe(true);
    expect(isRealSparkHistory({ source: "ticks", real: false })).toBe(true);
    expect(isRealSparkHistory({ source: "closes", real: true })).toBe(true);
    expect(isRealSparkHistory({ source: "closes", real: false })).toBe(true);
    expect(isRealSparkHistory({ real: true })).toBe(true);
    expect(isRealSparkHistory({ real: false })).toBe(false);
    expect(isRealSparkHistory({})).toBe(false);
  });

  it("el mercado consulta la historia antes de guardar la serie", () => {
    const market = read("app/(platform)/app/market-screen.tsx");
    const start = market.indexOf("const sparkBySymbol");
    const end = market.indexOf("const favoritesPending");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = market.slice(start, end);
    expect(block).toContain("isRealSparkHistory(data)");
    expect(block.indexOf("isRealSparkHistory(data)")).toBeLessThan(block.indexOf("map.set"));
    expect(block).toContain("points.length < 2");
    expect(block).toContain("downsample");
  });

  it("el catálogo marca las series como de ejemplo", () => {
    const catalog = read("app/dev/ui/catalog.tsx");
    expect(catalog).toContain('label="Serie de ejemplo al alza"');
    expect(catalog).toContain('label="Serie de ejemplo a la baja"');
    expect(catalog).toContain("Estas series son de ejemplo");
    expect(catalog).toContain("Las series de estas filas son de ejemplo");
  });

  it("el componente usa path, la animación de Reclu y no una serie inventada", () => {
    const source = read("components/domain/sparkline.tsx");
    expect(source.startsWith('"use client"')).toBe(true);
    expect(source).toContain("<path");
    expect(source).not.toContain("polyline");
    expect(source).not.toContain("sparklineData");
    expect(source).toContain("IntersectionObserver");
    expect(source).toContain("threshold: 0.2");
    expect(source).toContain("prefers-reduced-motion: reduce");
    expect(source).toContain("cubic-bezier(0.16, 1, 0.3, 1)");
    expect(source).toContain("0.8s");
    expect(source).toContain("armSparklineDraw(path, reduced)");
    expect(source).toContain("text-up");
    expect(source).toContain("text-down");
    expect(source).toContain("text-fg-muted");
  });
});
