import { describe, expect, it } from "vitest";

import {
  ATA_RENT_EXEMPT_LAMPORTS,
  BASE_TX_FEE_LAMPORTS,
  GAS_CUSHION_LAMPORTS,
  LAMPORTS_PER_SOL,
  checkSolGasRequirement,
  requiredGasLamports,
} from "@/lib/solana/gas-check";
import { redactRpcSecrets, translateSolanaError } from "@/lib/solana/tx-errors";

/**
 * M73: errores legibles + gas en SOL. Los valores de prueba de
 * `redactRpcSecrets` se arman CONCATENANDO prefijos y cuerpo (nunca un
 * literal completo), así el propio archivo no coincide con los patrones
 * de `scan:secrets` (`sb_secret_`, `re_`, `xox`, JWT `eyJ…`).
 */
const SB_PREFIX = "sb_" + "secret_";
const RE_PREFIX = "re" + "_";
const XOX_PREFIX = "xox" + "p-";
const JWT_HEAD = "e" + "yJ";
const JWT_A = "A1b2C3d4E5f6G7h8I9j0";
const JWT_B = "K1l2M3n4O5p6Q7r8S9t0";
const JWT_C = "U1v2W3x4Y5z6A7b8C9d0";

describe("M73: translateSolanaError", () => {
  it("slippage de Jupiter (0x1771 / 6001) → SLIPPAGE_EXCEEDED reintentable", () => {
    for (const raw of ["Error: 6001 slippage tolerance exceeded", "failed with 0x1771", "Slippage Tolerance Exceeded"]) {
      const result = translateSolanaError(raw);
      expect(result.code).toBe("SLIPPAGE_EXCEEDED");
      expect(result.retryable).toBe(true);
      expect(result.category).toBe("slippage");
      expect(result.userMessage).toContain("El precio se movió");
    }
  });

  it("user rejected de la billetera → USER_REJECTED, gana al resto", () => {
    const result = translateSolanaError("Wallet request declined by user 0x1771");
    expect(result.code).toBe("USER_REJECTED");
    expect(result.category).toBe("user_rejected");
    expect(result.retryable).toBe(true);
  });

  it("insufficient lamports para fees → INSUFFICIENT_SOL_GAS (no INSUFFICIENT_FUNDS)", () => {
    const result = translateSolanaError("Error: Insufficient lamports for fees");
    expect(result.code).toBe("INSUFFICIENT_SOL_GAS");
    String(result.userMessage).match(/SOL/i);
    expect(result.userMessage).toContain("comisión de la red");
    expect(result.category).toBe("insufficient_gas");
  });

  it("insufficient funds del token → INSUFFICIENT_FUNDS, no reintentable", () => {
    const result = translateSolanaError("custom program error: 0x1");
    expect(result.code).toBe("INSUFFICIENT_FUNDS");
    expect(result.retryable).toBe(false);
  });

  it("blockhash vencido → BLOCKHASH_EXPIRED reintentable", () => {
    const result = translateSolanaError("Blockhash not found");
    expect(result.code).toBe("BLOCKHASH_EXPIRED");
    expect(result.retryable).toBe(true);
    expect(result.userMessage).toContain("venció");
  });

  it("cuenta de token 0xbc4 → TOKEN_ACCOUNT_ERROR", () => {
    const result = translateSolanaError('custom program error: 0xbc4: {"InstructionError":[0,{"Custom":23}]}');
    expect(result.code).toBe("TOKEN_ACCOUNT_ERROR");
    expect(result.userMessage).toContain("cuenta del activo");
  });

  it("RPC caído (429/503/timeout) → RPC_UNAVAILABLE reintentable", () => {
    for (const raw of ["Request failed: 429 Too Many Requests", "fetch failed with 503", "ESOCKETTIMEDOUT timed out"]) {
      const result = translateSolanaError(raw);
      expect(result.code).toBe("RPC_UNAVAILABLE");
      expect(result.retryable).toBe(true);
    }
  });

  it("desconocido/Error/objeto → UNKNOWN sin fuga del texto crudo", () => {
    const result = translateSolanaError(new Error("algo raro pasó https://rpc.example.com"));
    expect(result.code).toBe("UNKNOWN");
    expect(result.userMessage).not.toContain("rpc.example.com");
    expect(result.userMessage).not.toContain("algo raro");
    // El objeto de Jupiter con errorCode.
    const jupiter = translateSolanaError({ errorCode: 429, error: "rate limit exceeded" });
    expect(jupiter.code).toBe("RPC_UNAVAILABLE");
    // `err` de getSignatureStatuses (objeto arbitrario).
    const onchain = translateSolanaError({ err: "AccountNotFound" });
    expect(onchain.code).toBe("TOKEN_ACCOUNT_ERROR");
    // null/undefined sin texto no revienta.
    expect(translateSolanaError(null).code).toBe("UNKNOWN");
    expect(translateSolanaError(undefined).code).toBe("UNKNOWN");
    expect(translateSolanaError("").code).toBe("UNKNOWN");
  });

  it("precedencia: gas antes que fondos cuando ambos calzan", () => {
    // "insufficient lamports for fees" también contiene "insufficient" pero
    // el orden de MATCHERS manda: gas primero.
    const result = translateSolanaError("insufficient lamports for fees and insufficient funds");
    expect(result.code).toBe("INSUFFICIENT_SOL_GAS");
  });
});

describe("M73: redactRpcSecrets", runRedactSuite);

/**
 * Comprobación inline del sanitizador: cubre tokens por prefijo, claves en
 * query strings, JWTs y stacktraces, sin escribir un literal detectable
 * en este archivo.
 */
function runRedactSuite() {
  it("tapa claves de query strings (?api-key=…&token=…)", () => {
    const url = `https://rpc.example.com/?api-key=${SB_PREFIX}${JWT_A}`;
    const redacted = redactRpcSecrets(url);
    expect(redacted).toContain("api-key=[REDACTADO]");
    expect(redacted).not.toContain(SB_PREFIX + JWT_A);
  });

  it("tapa JWTs completos", () => {
    const jwt = `${JWT_HEAD}${JWT_A}.${JWT_B}.${JWT_C}`;
    const redacted = redactRpcSecrets(`Authorization: ${jwt}`);
    expect(redacted).toContain("[REDACTADO]");
    expect(redacted).not.toContain(jwt);
  });

  it("tapa claves con prefijo conocido (sb_/re_/xox)", () => {
    for (const secret of [SB_PREFIX + JWT_A, RE_PREFIX + "aBcD12345678901234", XOX_PREFIX + "1234567890abc"]) {
      const redacted = redactRpcSecrets(`failed with ${secret}`);
      expect(redacted).not.toContain(secret);
      expect(redacted).toContain("[REDACTADO]");
    }
  });

  it("colapsa stacktraces y recorta espacios", () => {
    const redacted = redactRpcSecrets(
      `Error: boom\n    at Object.<anonymous> (app/server.ts:10:5)\n    at process.processTicksAndRejections (node:internal)\n`,
    );
    expect(redacted).not.toContain("at Object");
    expect(redacted).toContain("[stack]");
    expect(redacted.endsWith("\n")).toBe(false);
  });
}

describe("M73: checkSolGasRequirement", () => {
  it("con patrocinador el usuario necesita 0 SOL", async () => {
    const result = await checkSolGasRequirement({
      walletAddress: "9" .repeat(44),
      sponsorAvailable: true,
      getLamportsBalance: async () => 0,
    });
    expect(result.ok).toBe(true);
    expect(result.sponsored).toBe(true);
    expect(result.requiredLamports).toBe(0);
    expect(result.currentLamports).toBeNull();
    expect(result.userMessage).toContain("Maverlang");
  });

  it("saldo desconocido (sin proveedor o RPC caído) → ok fail-open, sin mensaje", async () => {
    const sinProveedor = await checkSolGasRequirement({ walletAddress: "A".repeat(44) });
    expect(sinProveedor.ok).toBe(true);
    expect(sinProveedor.currentLamports).toBeNull();
    expect(sinProveedor.deficitLamports).toBe(0);
    expect(sinProveedor.userMessage).toBe("");
    const rpcCaido = await checkSolGasRequirement({
      walletAddress: "B".repeat(44),
      getLamportsBalance: async () => {
        throw new Error("rpc down");
      },
    });
    expect(rpcCaido.ok).toBe(true);
    expect(rpcCaido.currentLamports).toBeNull();
    expect(rpcCaido.userMessage).toBe("");
  });

  it("saldo suficiente con y sin ATA nueva → ok", async () => {
    const conAta = await checkSolGasRequirement({
      walletAddress: "C".repeat(44),
      requiresNewAta: true,
      getLamportsBalance: async () => requiredGasLamports(true),
    });
    expect(conAta.ok).toBe(true);
    expect(conAta.currentLamports).toBe(requiredGasLamports(true));
    expect(conAta.deficitLamports).toBe(0);
    const sinAta = await checkSolGasRequirement({
      walletAddress: "D".repeat(44),
      getLamportsBalance: async () => LAMPORTS_PER_SOL / 100,
    });
    expect(sinAta.ok).toBe(true);
  });

  it("saldo insuficiente → ok:false con INSUFFICIENT_SOL_GAS y déficit exacto", async () => {
    const current = BASE_TX_FEE_LAMPORTS;
    const result = await checkSolGasRequirement({
      walletAddress: "E".repeat(44),
      requiresNewAta: true,
      getLamportsBalance: async () => current,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INSUFFICIENT_SOL_GAS");
    const required = BASE_TX_FEE_LAMPORTS + ATA_RENT_EXEMPT_LAMPORTS + GAS_CUSHION_LAMPORTS;
    expect(result.requiredLamports).toBe(required);
    expect(result.deficitLamports).toBe(required - current);
    expect(result.userMessage).toContain("No te alcanza el SOL");
  });

  it("requiredGasLamports: la ATA nueva suma exactamente la renta", () => {
    expect(requiredGasLamports(false)).toBe(BASE_TX_FEE_LAMPORTS + GAS_CUSHION_LAMPORTS);
    expect(requiredGasLamports(true) - requiredGasLamports(false)).toBe(ATA_RENT_EXEMPT_LAMPORTS);
  });
});
