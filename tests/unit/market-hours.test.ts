import { describe, expect, it } from "vitest";

import { marketStatusSchema } from "@/lib/api/contracts";
import { mockMarketStatus } from "@/lib/mocks/market";

describe("horario 24/5", () => {
  it("el sábado en Nueva York está cerrado hasta el lunes", () => {
    const status = marketStatusSchema.parse(mockMarketStatus(new Date("2026-10-03T16:00:00.000Z")));
    expect(status).toMatchObject({ underlyingOpen: false, session: "closed" });
    expect(status.note).toMatch(/lunes/);
  });

  it("el miércoles a las 10 en Nueva York es horario regular", () => {
    const status = mockMarketStatus(new Date("2026-10-07T14:00:00.000Z"));
    expect(status).toMatchObject({ underlyingOpen: true, session: "regular" });
  });

  it("el miércoles a las 18 queda fuera del horario regular", () => {
    const status = mockMarketStatus(new Date("2026-10-07T22:00:00.000Z"));
    expect(status).toMatchObject({ underlyingOpen: false, session: "offHours" });
    expect(status.note).toMatch(/puede variar más/);
  });

  it("el viernes después del cierre no cuenta como fin de semana", () => {
    const status = mockMarketStatus(new Date("2026-10-09T21:00:00.000Z"));
    expect(status).toMatchObject({ underlyingOpen: false, session: "offHours" });
  });
});
