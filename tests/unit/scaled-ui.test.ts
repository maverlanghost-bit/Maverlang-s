import { describe, expect, it } from "vitest";

import { getEffectiveMultiplier, rawToShares, sharesToRaw } from "@/lib/solana/scaled-ui";

const config = {
  multiplier: 1,
  newMultiplier: 2,
  newMultiplierEffectiveTimestamp: 1_700_000_000,
};

describe("scaled-ui", () => {
  it("usa newMultiplier si el timestamp ya llegó", () => {
    expect(getEffectiveMultiplier(config, 1_700_000_000)).toBe(2);
    expect(getEffectiveMultiplier(config, 1_800_000_000)).toBe(2);
  });

  it("mantiene multiplier si el timestamp es futuro", () => {
    expect(getEffectiveMultiplier(config, 1_699_999_999)).toBe(1);
  });

  it("pasa de crudo a acciones y vuelve", () => {
    expect(rawToShares(BigInt(100_000_000), 8, 2)).toBe(2);
    expect(sharesToRaw(2, 8, 2)).toBe(BigInt(100_000_000));
  });
});
