import { describe, expect, it } from "vitest";

import { USDC_MINT } from "@/config/tickers";
import { classifyMint, isOfficialMint, isTradableMint, tradableTicker } from "@/lib/solana/allowlist";

const FAKE_MINT = "FakeMint111111111111111111111111111111111";

describe("allowlist", () => {
  it("rechaza un mint falso", () => {
    expect(classifyMint(FAKE_MINT)).toBe("unknown");
    expect(isTradableMint(FAKE_MINT)).toBe(false);
    expect(isOfficialMint(FAKE_MINT)).toBe(false);
    expect(tradableTicker("FAKE")).toBeNull();
  });

  it("acepta USDC y una acción habilitada", () => {
    expect(classifyMint(USDC_MINT)).toBe("usdc");
    expect(isTradableMint(USDC_MINT)).toBe(true);
    expect(tradableTicker("AAPLx")?.symbol).toBe("AAPLx");
  });
});
