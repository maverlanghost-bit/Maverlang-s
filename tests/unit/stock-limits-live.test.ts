import { beforeEach, describe, expect, it, vi } from "vitest";
import { tickerBySymbol, USDC_MINT } from "@/config/tickers";
import { liveStockLimits } from "@/lib/services/stock-limits.live";
import { TOKEN_2022_PROGRAM_ID } from "@/lib/solana/token-instructions";

const rpc = vi.hoisted(() => ({
  getParsedAccountInfo: vi.fn(),
  getBlockTime: vi.fn(),
}));

vi.mock("@/lib/solana/connection", () => ({
  getServerConnection: () => rpc,
  publicCluster: () => "mainnet-beta",
}));

const observedAtUnix = 1_800_000_000;
const request = { symbol: "NVDAx", side: "buy", amount: "60", limitPriceUsdc: "120" } as const;

function stockMint(state: Record<string, unknown>, transferHookProgram: string | null = null, paused = false) {
  return {
    context: { slot: 312_345_678 },
    value: {
      owner: TOKEN_2022_PROGRAM_ID,
      data: {
        parsed: {
          type: "mint",
          info: {
            decimals: 8,
            extensions: [
              { extension: "scaledUiAmountConfig", state },
              { extension: "transferHook", state: { programId: transferHookProgram } },
              { extension: "pausableConfig", state: { paused } },
            ],
          },
        },
      },
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  rpc.getBlockTime.mockResolvedValue(observedAtUnix);
});

describe("vista previa de límite con lectura de Solana", () => {
  it("usa los mints del catálogo y el multiplicador activo en el slot observado", async () => {
    rpc.getParsedAccountInfo.mockResolvedValue(stockMint({
      multiplier: "1",
      newMultiplier: "2",
      newMultiplierEffectiveTimestamp: observedAtUnix + 3600,
    }));
    const preview = await liveStockLimits.preview(request);
    const expectedMint = tickerBySymbol("NVDAx")?.mint;
    expect(rpc.getParsedAccountInfo.mock.calls[0][0].toBase58()).toBe(expectedMint);
    expect(preview).toMatchObject({
      inputMint: USDC_MINT,
      outputMint: expectedMint,
      inputAtoms: "60000000",
      minimumOutputAtoms: "50000000",
      observedAtUnix,
      nextMultiplierAtUnix: observedAtUnix + 3600,
      multiplier: 1,
    });
  });

  it("pausa cerca del cambio y usa el valor nuevo después de activarse", async () => {
    rpc.getParsedAccountInfo.mockResolvedValue(stockMint({
      multiplier: 1,
      newMultiplier: 2,
      newMultiplierEffectiveTimestamp: observedAtUnix + 300,
    }));
    await expect(liveStockLimits.preview(request)).rejects.toMatchObject({ code: "ASSET_UNAVAILABLE" });
    rpc.getBlockTime.mockResolvedValue(observedAtUnix + 3600);
    await expect(liveStockLimits.preview(request)).resolves.toMatchObject({
      multiplier: 2,
      minimumOutputAtoms: "25000000",
      nextMultiplierAtUnix: null,
    });
  });

  it("falla cerrado si falta el multiplicador o el activo no está en el catálogo", async () => {
    await expect(liveStockLimits.preview({ ...request, symbol: "SOL" })).rejects.toMatchObject({
      code: "MINT_NOT_ALLOWED",
    });
    expect(rpc.getParsedAccountInfo).not.toHaveBeenCalled();
    rpc.getParsedAccountInfo.mockResolvedValue(stockMint({
      newMultiplier: 2,
      newMultiplierEffectiveTimestamp: observedAtUnix,
    }));
    await expect(liveStockLimits.preview(request)).rejects.toMatchObject({ code: "UPSTREAM" });
  });

  it("rechaza un hook activo o un mint pausado", async () => {
    const scale = { multiplier: 1, newMultiplier: 1, newMultiplierEffectiveTimestamp: 0 };
    rpc.getParsedAccountInfo.mockResolvedValue(stockMint(scale, TOKEN_2022_PROGRAM_ID.toBase58()));
    await expect(liveStockLimits.preview(request)).rejects.toMatchObject({ code: "ASSET_UNAVAILABLE" });
    rpc.getParsedAccountInfo.mockResolvedValue(stockMint(scale, null, true));
    await expect(liveStockLimits.preview(request)).rejects.toMatchObject({ code: "ASSET_UNAVAILABLE" });
  });
});
