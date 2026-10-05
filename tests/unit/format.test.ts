import { describe, expect, it } from "vitest";

import {
  formatClp,
  formatDateTime,
  formatMoney,
  formatPercent,
  formatPortion,
  formatRelative,
  formatShares,
  formatUsd,
} from "@/lib/format";

const now = Date.UTC(2026, 9, 5, 15, 0, 0);
const hour = 60 * 60 * 1000;
const day = 24 * hour;

describe("format", () => {
  it("formatea dinero, porcentaje y acciones en es-CL", () => {
    expect(formatClp(1234)).toBe("$1.234");
    expect(formatUsd(1234.56)).toBe("US$1.234,56");
    expect(formatMoney(1234, "CLP")).toBe("$1.234");
    expect(formatMoney(1234.56, "USD")).toBe("US$1.234,56");
    expect(formatPercent(0.0123)).toBe("+1,23%");
    expect(formatPercent(0)).toBe("0,00%");
    expect(formatShares(1.5)).toBe("1,5 acc.");
    expect(formatPortion(0.307)).toMatch(/^30,7\s*%$/);
  });

  it("dice el pasado y el futuro en español de Chile", () => {
    expect(formatRelative(now - 3 * hour, now)).toBe("hace 3 horas");
    expect(formatRelative(now + 3 * day, now)).toBe("dentro de 3 días");
    expect(formatRelative("no-es-fecha", now)).toBe("fecha desconocida");
    expect(formatDateTime("no-es-fecha")).toBe("fecha desconocida");
  });
});
