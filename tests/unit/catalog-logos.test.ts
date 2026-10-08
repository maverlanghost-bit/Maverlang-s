import { describe, expect, it } from "vitest";

import { logoPathIfPresent } from "@/lib/catalog/logos";

describe("logo local", () => {
  it("usa el archivo del subyacente y no inventa uno", () => {
    const files = new Set(["aal.png", "brk-b.png"]);
    expect(logoPathIfPresent("AAL", files)).toBe("/logos/aal.png");
    expect(logoPathIfPresent("BRK.B", files)).toBe("/logos/brk-b.png");
    expect(logoPathIfPresent("ZZZ", files)).toBeNull();
    expect(logoPathIfPresent("", files)).toBeNull();
    expect(logoPathIfPresent("   ", new Set(["token.png"]))).toBeNull();
  });
});
