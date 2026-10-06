import { existsSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { TICKERS } from "@/config/tickers";

describe("logos del catálogo", () => {
  it("cada ticker con logo tiene el archivo en public", () => {
    const withLogo = TICKERS.filter((ticker) => ticker.logo.trim().length > 0);

    expect(withLogo.length).toBe(TICKERS.length);

    for (const ticker of withLogo) {
      const relative = ticker.logo.replace(/^\//, "");
      const file = path.join(process.cwd(), "public", relative);
      expect(existsSync(file), `${ticker.symbol} ${ticker.logo}`).toBe(true);
      expect(statSync(file).size, ticker.symbol).toBeGreaterThan(0);
    }
  });
});
