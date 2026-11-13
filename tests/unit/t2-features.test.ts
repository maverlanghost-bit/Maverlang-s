import { describe, expect, it } from "vitest";

import { explainChartHref } from "@/components/domain/explain-chart-button";
import { computeAchievements, recordVisit, santiagoDay, type StreakState } from "@/lib/achievements";
import { formatSharePct, parseSharePct, shareCardPath } from "@/lib/share-card";

const EMPTY_STREAK: StreakState = { lastDay: null, current: 0, best: 0 };

describe("porcentaje de la tarjeta para compartir", () => {
  it("sin número válido devuelve null", () => {
    expect(parseSharePct(null)).toBeNull();
    expect(parseSharePct(undefined)).toBeNull();
    expect(parseSharePct("abc")).toBeNull();
    expect(parseSharePct("Infinity")).toBeNull();
  });

  it("redondea a un decimal y acota al rango permitido", () => {
    expect(parseSharePct("12.345")).toBe(12.3);
    expect(parseSharePct("-500")).toBe(-100);
    expect(parseSharePct("1e9")).toBe(10000);
    expect(parseSharePct("12.3")).toBe(12.3);
  });

  it("formatea con coma decimal, signo y espacio antes del %", () => {
    expect(formatSharePct(12.3)).toBe("+12,3 %");
    expect(formatSharePct(-4)).toBe("-4,0 %");
  });

  it("arma la ruta de la tarjeta con y sin porcentaje", () => {
    expect(shareCardPath("apple")).toBe("/tarjeta/apple");
    expect(shareCardPath("apple", 12.3)).toBe("/tarjeta/apple?pct=12.3");
    expect(shareCardPath("apple", null)).toBe("/tarjeta/apple");
    expect(shareCardPath("a b")).toBe("/tarjeta/a%20b");
  });
});

describe("racha de visitas", () => {
  it("el primer día arranca la racha en 1", () => {
    expect(recordVisit(EMPTY_STREAK, "2026-11-10")).toEqual({
      lastDay: "2026-11-10",
      current: 1,
      best: 1,
    });
  });

  it("el mismo día no suma ni cambia el estado", () => {
    const day1 = recordVisit(EMPTY_STREAK, "2026-11-10");
    expect(recordVisit(day1, "2026-11-10")).toEqual(day1);
  });

  it("el día siguiente suma uno y actualiza el mejor", () => {
    const day1 = recordVisit(EMPTY_STREAK, "2026-11-10");
    const day2 = recordVisit(day1, "2026-11-11");
    expect(day2.current).toBe(2);
    expect(day2.best).toBe(2);
    expect(day2.lastDay).toBe("2026-11-11");
  });

  it("un salto reinicia la racha pero conserva el mejor", () => {
    const day2 = recordVisit(recordVisit(EMPTY_STREAK, "2026-11-10"), "2026-11-11");
    const later = recordVisit(day2, "2026-11-15");
    expect(later.current).toBe(1);
    expect(later.best).toBe(2);
    expect(later.lastDay).toBe("2026-11-15");
  });

  it("no muta el estado anterior", () => {
    const previous: StreakState = { lastDay: "2026-11-10", current: 1, best: 1 };
    recordVisit(previous, "2026-11-11");
    expect(previous).toEqual({ lastDay: "2026-11-10", current: 1, best: 1 });
  });
});

describe("logros educativos", () => {
  it("devuelve logros con forma estable e ids únicos", () => {
    const list = computeAchievements({ streak: EMPTY_STREAK, favorites: 0, guidesRead: 0 });
    expect(list.length).toBeGreaterThanOrEqual(5);
    const ids = list.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of list) {
      expect(item.id.trim().length).toBeGreaterThan(0);
      expect(item.title.trim().length).toBeGreaterThan(0);
      expect(item.description.trim().length).toBeGreaterThan(0);
      expect(typeof item.unlocked).toBe("boolean");
    }
    expect(list.some((item) => !item.unlocked)).toBe(true);
  });

  it("con racha, favoritas y guías completas se desbloquea todo", () => {
    const list = computeAchievements({
      streak: { lastDay: "2026-11-10", current: 7, best: 7 },
      favorites: 5,
      guidesRead: 3,
    });
    expect(list.length).toBeGreaterThanOrEqual(5);
    expect(list.every((item) => item.unlocked)).toBe(true);
  });

  it("se desbloquean de a poco", () => {
    const one = computeAchievements({
      streak: { lastDay: "2026-11-10", current: 1, best: 1 },
      favorites: 1,
      guidesRead: 1,
    });
    const many = computeAchievements({
      streak: { lastDay: "2026-11-10", current: 7, best: 7 },
      favorites: 5,
      guidesRead: 3,
    });
    const unlockedOne = one.filter((item) => item.unlocked).length;
    const unlockedMany = many.filter((item) => item.unlocked).length;
    expect(unlockedOne).toBeGreaterThan(0);
    expect(unlockedMany).toBeGreaterThan(unlockedOne);
  });
});

describe("día de Santiago", () => {
  it("usa la hora de America/Santiago y no UTC", () => {
    expect(santiagoDay(new Date("2026-11-10T02:30:00.000Z"))).toBe("2026-11-09");
    expect(santiagoDay(new Date("2026-11-10T03:30:00.000Z"))).toBe("2026-11-10");
  });

  it("respeta el horario de invierno", () => {
    expect(santiagoDay(new Date("2026-07-15T03:30:00.000Z"))).toBe("2026-07-14");
  });
});

describe("enlace «Explícame este gráfico»", () => {
  it("apunta al asistente con ticker y pregunta", () => {
    const href = explainChartHref("AAPLx", "Apple Inc.", "1M");
    expect(href.startsWith("/app/asistente?")).toBe(true);
    const url = new URL(href, "https://maverlang.com");
    expect(url.pathname).toBe("/app/asistente");
    expect(url.searchParams.get("ticker")).toBe("AAPLx");
    const question = url.searchParams.get("q") ?? "";
    expect(question).toContain("Apple Inc.");
    expect(question).toContain("AAPLx");
    expect(question).toContain("1M");
    expect(question.toLowerCase()).toContain("sin recomendaciones");
  });

  it("sin rango igual entrega una pregunta", () => {
    const href = explainChartHref("MSFTx", "Microsoft Corporation");
    const url = new URL(href, "https://maverlang.com");
    expect(url.searchParams.get("ticker")).toBe("MSFTx");
    expect((url.searchParams.get("q") ?? "").length).toBeGreaterThan(20);
  });
});
