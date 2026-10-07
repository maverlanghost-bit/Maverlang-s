import { describe, expect, it } from "vitest";

import { isOnrampModelSelectable, resolveOnrampModel } from "@/lib/onramp/model";

describe("resolveOnrampModel", () => {
  it("sin variable o con otro valor -> widget (nunca rompe el arranque)", () => {
    expect(resolveOnrampModel(undefined)).toBe("widget");
    expect(resolveOnrampModel("")).toBe("widget");
    expect(resolveOnrampModel("mock")).toBe("widget");
    expect(resolveOnrampModel("WIDGET")).toBe("widget");
  });

  it("api se resuelve tal cual (sólo desarrollo)", () => {
    expect(resolveOnrampModel("api")).toBe("api");
  });
});

describe("isOnrampModelSelectable", () => {
  it("widget se puede elegir en cualquier entorno", () => {
    expect(isOnrampModelSelectable("widget", "production")).toBe(true);
    expect(isOnrampModelSelectable("widget", "development")).toBe(true);
    expect(isOnrampModelSelectable("widget", "test")).toBe(true);
    expect(isOnrampModelSelectable("widget", undefined)).toBe(true);
  });

  it("api no se puede elegir con NODE_ENV=production", () => {
    expect(isOnrampModelSelectable("api", "production")).toBe(false);
  });

  it("api se puede elegir fuera de producción (dev, M75)", () => {
    expect(isOnrampModelSelectable("api", "development")).toBe(true);
    expect(isOnrampModelSelectable("api", "test")).toBe(true);
  });
});
