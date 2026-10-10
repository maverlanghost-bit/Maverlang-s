import { describe, expect, it } from "vitest";

import {
  orderHasTransaction,
  parseJupiterExecute,
  type JupiterExecuteLike,
  type JupiterOrderLike,
} from "@/lib/market/jupiter-order";

/**
 * Tests del parser de EJECUCIÓN de Jupiter (`POST /swap/v2/execute`).
 * Funciones puras: no tocan la red, sólo reciben el cuerpo JSON tal cual.
 */

describe("parseJupiterExecute", () => {
  it("mapea Success con signature a submitted", () => {
    const body: JupiterExecuteLike = { status: "Success", signature: "5abc123xyz" };
    expect(parseJupiterExecute(body)).toEqual({ status: "submitted", signature: "5abc123xyz" });
  });

  it("mapea Failed con error a failed sin signature", () => {
    const body: JupiterExecuteLike = { status: "Failed", error: "Simulation failed" };
    const result = parseJupiterExecute(body);
    expect(result.status).toBe("failed");
    expect(result.signature).toBeNull();
    expect(result.error).toBe("Simulation failed");
  });

  it("lanza si status es submitted (Success) sin signature", () => {
    expect(() => parseJupiterExecute({ status: "Success" })).toThrow();
    expect(() => parseJupiterExecute({ status: "Success", signature: "  " })).toThrow();
  });
});

describe("orderHasTransaction", () => {
  it("devuelve false con transaction null o vacía", () => {
    expect(orderHasTransaction({} as JupiterOrderLike)).toBe(false);
    expect(orderHasTransaction({ transaction: null } as JupiterOrderLike)).toBe(false);
    expect(orderHasTransaction({ transaction: "" })).toBe(false);
    expect(orderHasTransaction({ transaction: "   " })).toBe(false);
  });

  it("devuelve true con transaction base64 no vacía", () => {
    expect(orderHasTransaction({ transaction: "AQIDBAUGBwg=" })).toBe(true);
  });
});
