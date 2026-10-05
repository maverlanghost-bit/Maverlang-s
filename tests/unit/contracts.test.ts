import { describe, expect, it } from "vitest";

import {
  parseContract,
  parseMockErrorCode,
  sendBuildRequestSchema,
  tradeQuoteRequestSchema,
} from "@/lib/api/contracts";
import { DomainError } from "@/lib/api/result";

function validationOf(run: () => void): DomainError {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error("esperaba un error de validación");
}

describe("contratos zod", () => {
  it("un request inválido es VALIDATION", () => {
    const missing = validationOf(() => parseContract(tradeQuoteRequestSchema, {}));
    expect(missing.code).toBe("VALIDATION");

    const amount = validationOf(() =>
      parseContract(tradeQuoteRequestSchema, {
        side: "buy",
        symbol: "AAPLx",
        amount: 0,
        amountCurrency: "USDC",
      }),
    );
    expect(amount.code).toBe("VALIDATION");

    const extra = validationOf(() =>
      parseContract(tradeQuoteRequestSchema, {
        side: "buy",
        symbol: "AAPLx",
        amount: 1,
        amountCurrency: "USDC",
        extra: true,
      }),
    );
    expect(extra.code).toBe("VALIDATION");

    const send = validationOf(() =>
      parseContract(sendBuildRequestSchema, {
        to: "corta",
        mint: "corta",
        amountUi: -1,
        userPublicKey: "corta",
      }),
    );
    expect(send.code).toBe("VALIDATION");

    const mockError = validationOf(() => {
      parseMockErrorCode("NO_EXISTE");
    });
    expect(mockError.code).toBe("VALIDATION");
  });

  it("acepta una cotización completa", () => {
    const parsed = parseContract(tradeQuoteRequestSchema, {
      side: "buy",
      symbol: "AAPLx",
      amount: 10,
      amountCurrency: "USDC",
    });
    expect(parsed.symbol).toBe("AAPLx");
  });
});
