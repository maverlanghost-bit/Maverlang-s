import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignatureStatusLike } from "@/lib/solana/signature-status";
import { tokenAccountAddressesForOwner } from "@/lib/solana/usdc-token-accounts";
import { USDC_DECIMALS, USDC_MINT_SOLANA } from "@/lib/wallet/deposit-indexer";
import {
  DEPOSIT_SCAN_MAX_TOKEN_ACCOUNTS,
  SOLANA_TX_PARSE_OPTIONS,
  extractUsdcDepositsFromTransactions,
  syncSolanaUsdcDeposits,
  type DepositSyncDeps,
  type ParsedTokenBalanceLike,
  type ParsedTxLike,
} from "@/lib/wallet/deposit-sync";

/**
 * Paso 3 del piloto de depósitos USDC: cuentas de token SECUNDARIAS.
 *
 * Lo que se prueba, con dependencias inyectadas (sin red, sin Supabase y sin
 * `.env`):
 * - Descubrimiento de todas las cuentas USDC abiertas (ATA + secundarias) y
 *   escaneo de sus firmas: una transferencia que sólo toca la secundaria se
 *   acredita una vez.
 * - Una firma que aparece en varias cuentas del mismo dueño se procesa una
 *   sola vez y por el NETO de todas sus cuentas (no suma entradas sueltas).
 * - Salidas y transferencias entre cuentas propias no inflan el crédito.
 * - Fail closed: dueño ausente en un balance, cambio de dueño en la misma
 *   cuenta, decimal/mint incorrectos, tx fallida o no confirmada no acreditan.
 * - La propiedad ACTUAL sólo sirve para descubrir direcciones: una tx
 *   histórica de otro dueño no se atribuye al dueño de hoy.
 * - Idempotencia: repetir el barrido no duplica el crédito.
 * - Límites honestos: si el descubrimiento falla se omite la billetera; si hay
 *   más cuentas que el tope, se reporta lo que quedó fuera.
 */

const OWNER = "So11111111111111111111111111111111111111112";
const ATA = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const SECONDARY = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const OTHER_OWNER = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const OTHER_MINT = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
const USER = "user-secundarias";
const PILOT_EMAIL = "secundarias@maverlang.test";

interface Harness {
  signatures: Record<string, string[]>;
  txs: Record<string, ParsedTxLike | null>;
  statuses: Record<string, SignatureStatusLike>;
  /** Libro `crypto_deposits`: firma → monto (sólo confirmed/finalized). */
  credits: Map<string, number>;
  /** `wallet_movements.reference` ya registrada (pending o confirmed). */
  movements: Set<string>;
}

function newHarness(): Harness {
  return { signatures: {}, txs: {}, statuses: {}, credits: new Map(), movements: new Set() };
}

function balance(
  accountIndex: number,
  owner: string | undefined,
  uiAmount: number,
  opts: { mint?: string; decimals?: number | null } = {},
): ParsedTokenBalanceLike {
  const decimals = opts.decimals === undefined ? USDC_DECIMALS : opts.decimals;
  const tokenAmount: ParsedTokenBalanceLike["uiTokenAmount"] = {
    uiAmount,
    amount: String(Math.round(uiAmount * 10 ** (decimals ?? USDC_DECIMALS))),
  };
  if (decimals !== null) tokenAmount.decimals = decimals;
  const row: ParsedTokenBalanceLike = {
    accountIndex,
    mint: opts.mint ?? USDC_MINT_SOLANA,
    uiTokenAmount: tokenAmount,
  };
  if (typeof owner === "string") row.owner = owner;
  return row;
}

function parsedTx(
  signature: string,
  pre: ParsedTokenBalanceLike[],
  post: ParsedTokenBalanceLike[],
  opts: { err?: unknown; version?: number | "legacy" } = {},
): ParsedTxLike {
  return {
    meta: { err: opts.err ?? null, preTokenBalances: pre, postTokenBalances: post },
    transaction: { signatures: [signature] },
    blockTime: 1_700_000_000,
    ...(opts.version === undefined ? {} : { version: opts.version }),
  };
}

function publish(
  harness: Harness,
  params: {
    signature: string;
    addresses: readonly string[];
    tx: ParsedTxLike;
    confirmationStatus?: SignatureStatusLike["confirmationStatus"];
    statusErr?: unknown;
  },
): void {
  harness.txs[params.signature] = params.tx;
  harness.statuses[params.signature] = {
    confirmationStatus: params.confirmationStatus ?? "confirmed",
    slot: 10,
    confirmations: 1,
    err: params.statusErr ?? null,
  };
  for (const address of params.addresses) {
    harness.signatures[address] = [...(harness.signatures[address] ?? []), params.signature];
  }
}

function makeDeps(
  harness: Harness,
  opts: {
    tokenAccounts?: readonly string[];
    listOwnedTokenAccounts?: DepositSyncDeps["listOwnedTokenAccounts"];
  } = {},
): DepositSyncDeps {
  return {
    dataMode: () => "live",
    now: () => new Date("2026-11-06T12:00:00.000Z"),
    countWallets: async () => 1,
    listWallets: async () => [{ userId: USER, address: OWNER }],
    listOwnedTokenAccounts:
      opts.listOwnedTokenAccounts ?? (async () => opts.tokenAccounts ?? []),
    listSignatures: async (address) => harness.signatures[address] ?? [],
    readTransactions: async (signatures) => ({
      transactions: signatures.map((signature) => harness.txs[signature] ?? null),
      statuses: signatures.map((signature) => harness.statuses[signature] ?? null),
    }),
    listKnownSignatures: async () => [...harness.credits.keys()],
    verifiedEmailOf: async () => ({ email: PILOT_EMAIL, emailVerified: true }),
    recordDeposit: async (input) => {
      // Espejo de `recordDeposit` real: el libro sólo recibe confirmed/finalized;
      // el movimiento se escribe una vez por firma (idempotente por reference).
      const ledgerEligible = input.lifecycle === "confirmed" || input.lifecycle === "finalized";
      let inserted = false;
      if (ledgerEligible && !harness.credits.has(input.signature)) {
        harness.credits.set(input.signature, input.amountUi);
        inserted = true;
      }
      let movementInserted = false;
      if (!harness.movements.has(input.signature)) {
        harness.movements.add(input.signature);
        movementInserted = true;
      }
      return inserted || movementInserted ? "recorded" : "duplicate";
    },
    log: () => {},
  };
}

beforeEach(() => {
  vi.stubEnv("DEPOSIT_ALLOWLIST_EMAILS", PILOT_EMAIL);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("descubrimiento de cuentas USDC", () => {
  it("valida mint y dueño, y deduplica direcciones", () => {
    const response = {
      value: [
        {
          pubkey: { toBase58: () => ATA },
          account: { data: { parsed: { info: { mint: USDC_MINT_SOLANA, owner: OWNER } } } },
        },
        {
          pubkey: { toBase58: () => SECONDARY },
          account: { data: { parsed: { info: { mint: USDC_MINT_SOLANA, owner: OWNER } } } },
        },
        {
          pubkey: { toBase58: () => ATA },
          account: { data: { parsed: { info: { mint: USDC_MINT_SOLANA, owner: OWNER } } } },
        },
      ],
    };

    expect(tokenAccountAddressesForOwner(response, OWNER)).toEqual([ATA, SECONDARY]);
    expect(tokenAccountAddressesForOwner({ value: [] }, OWNER)).toEqual([]);
  });

  it("falla cerrado si una fila no se puede atribuir", () => {
    const row = (info: Record<string, unknown> | null, address = ATA) => ({
      pubkey: { toBase58: () => address },
      account: { data: { parsed: info === null ? null : { info } } },
    });

    expect(() =>
      tokenAccountAddressesForOwner(
        { value: [row({ mint: USDC_MINT_SOLANA, owner: OTHER_OWNER })] },
        OWNER,
      ),
    ).toThrow(/otro dueño/);
    expect(() =>
      tokenAccountAddressesForOwner(
        { value: [row({ mint: OTHER_MINT, owner: OWNER })] },
        OWNER,
      ),
    ).toThrow(/otro mint/);
    expect(() =>
      tokenAccountAddressesForOwner(
        { value: [row({ mint: USDC_MINT_SOLANA })] },
        OWNER,
      ),
    ).toThrow(/otro dueño/);
    expect(() => tokenAccountAddressesForOwner({ value: [row(null)] }, OWNER)).toThrow(
      /sin datos parseados/,
    );
  });

  it("el parseo de transacciones declara la versión 0 (loaded addresses)", () => {
    expect(SOLANA_TX_PARSE_OPTIONS).toEqual({
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
  });
});

describe("acreditación de cuentas secundarias", () => {
  it("ATA y secundaria en la MISMA firma: un solo crédito por el neto (v0)", async () => {
    const harness = newHarness();
    // índices 7 y 8: cuentas cargadas por lookup table (v0), no claves estáticas.
    const tx = parsedTx(
      "sig-dual",
      [balance(7, OWNER, 10), balance(8, OWNER, 0)],
      [balance(7, OWNER, 40), balance(8, OWNER, 20)],
      { version: 0 },
    );
    publish(harness, { signature: "sig-dual", addresses: [OWNER, ATA, SECONDARY], tx });

    const summary = await syncSolanaUsdcDeposits(
      makeDeps(harness, { tokenAccounts: [ATA, SECONDARY] }),
    );

    expect(summary).toMatchObject({
      ok: true,
      walletsScanned: 1,
      signaturesChecked: 1,
      tokenAccountsDiscovered: 2,
      tokenAccountsSkipped: 0,
      confirmed: 1,
    });
    expect([...harness.credits.entries()]).toEqual([["sig-dual", 50]]);
    expect(harness.movements.size).toBe(1);

    // Duplicado: la misma firma en billetera, ATA y secundaria no vuelve a acreditar.
    const again = await syncSolanaUsdcDeposits(
      makeDeps(harness, { tokenAccounts: [ATA, SECONDARY] }),
    );
    expect(again.confirmed).toBe(0);
    expect(again.duplicates).toBe(1);
    expect(harness.credits.size).toBe(1);

    // Repetir el descubrimiento en cada corrida tampoco multiplica: se deduplica
    // por firma, no por cuenta que la reporta.
    expect(again.tokenAccountsDiscovered).toBe(2);
  });

  it("un depósito que sólo entró a la secundaria se descubre por su dirección", async () => {
    const harness = newHarness();
    const tx = parsedTx("sig-sec", [balance(8, OWNER, 0)], [balance(8, OWNER, 25)]);
    // El dueño NO firma: ni la billetera ni la ATA ven esta firma.
    publish(harness, { signature: "sig-sec", addresses: [SECONDARY], tx });

    const summary = await syncSolanaUsdcDeposits(makeDeps(harness, { tokenAccounts: [SECONDARY] }));

    expect(summary.confirmed).toBe(1);
    expect(summary.tokenAccountsDiscovered).toBe(1);
    expect([...harness.credits.entries()]).toEqual([["sig-sec", 25]]);
  });

  it("una salida de la billetera no crea depósito", async () => {
    const harness = newHarness();
    const tx = parsedTx("sig-out", [balance(7, OWNER, 100)], [balance(7, OWNER, 60)]);
    publish(harness, { signature: "sig-out", addresses: [OWNER, ATA], tx });

    const summary = await syncSolanaUsdcDeposits(makeDeps(harness, { tokenAccounts: [ATA] }));

    expect(summary.confirmed).toBe(0);
    expect(harness.credits.size).toBe(0);
    expect(harness.movements.size).toBe(0);
  });

  it("mover USDC entre cuentas propias no infla el crédito (neto cero)", async () => {
    const harness = newHarness();
    const tx = parsedTx(
      "sig-self",
      [balance(7, OWNER, 100), balance(8, OWNER, 0)],
      [balance(7, OWNER, 0), balance(8, OWNER, 100)],
    );
    publish(harness, { signature: "sig-self", addresses: [OWNER, ATA, SECONDARY], tx });

    const summary = await syncSolanaUsdcDeposits(
      makeDeps(harness, { tokenAccounts: [ATA, SECONDARY] }),
    );

    expect(summary.confirmed).toBe(0);
    expect(harness.credits.size).toBe(0);
  });

  it("un depósito externo junto con una salida propia acredita sólo el neto", async () => {
    const harness = newHarness();
    const tx = parsedTx(
      "sig-mixed",
      [balance(7, OWNER, 100), balance(8, OWNER, 0)],
      [balance(7, OWNER, 40), balance(8, OWNER, 100)],
    );
    publish(harness, { signature: "sig-mixed", addresses: [OWNER, ATA, SECONDARY], tx });

    const summary = await syncSolanaUsdcDeposits(
      makeDeps(harness, { tokenAccounts: [ATA, SECONDARY] }),
    );

    expect(summary.confirmed).toBe(1);
    expect([...harness.credits.entries()]).toEqual([["sig-mixed", 40]]);
  });

  it("una cuenta con dueño ausente descarta la transacción (fail closed)", async () => {
    const harness = newHarness();
    const tx = parsedTx(
      "sig-no-owner",
      [balance(7, OWNER, 0)],
      [balance(7, undefined, 25)],
    );
    publish(harness, { signature: "sig-no-owner", addresses: [OWNER, ATA], tx });

    const summary = await syncSolanaUsdcDeposits(makeDeps(harness, { tokenAccounts: [ATA] }));

    expect(summary.confirmed).toBe(0);
    expect(harness.credits.size).toBe(0);
  });

  it("un cambio de dueño de la cuenta no se interpreta como depósito", () => {
    const found = extractUsdcDepositsFromTransactions({
      walletAddress: OWNER,
      signatures: ["sig-owner-change"],
      transactions: [
        parsedTx(
          "sig-owner-change",
          [balance(7, OTHER_OWNER, 100)],
          [balance(7, OWNER, 100)],
        ),
      ],
      statuses: [{ confirmationStatus: "confirmed", err: null }],
    });

    expect(found).toEqual([]);
  });

  it("la propiedad actual sólo sirve para descubrir: una tx de otro dueño no se acredita", async () => {
    const harness = newHarness();
    const tx = parsedTx("sig-historica", [balance(7, OTHER_OWNER, 0)], [balance(7, OTHER_OWNER, 90)]);
    publish(harness, { signature: "sig-historica", addresses: [ATA], tx });

    const summary = await syncSolanaUsdcDeposits(makeDeps(harness, { tokenAccounts: [ATA] }));

    expect(summary.confirmed).toBe(0);
    expect(harness.credits.size).toBe(0);
  });

  it("mint distinto o decimales distintos de 6 no acreditan", async () => {
    const harness = newHarness();
    publish(harness, {
      signature: "sig-otro-mint",
      addresses: [ATA],
      tx: parsedTx(
        "sig-otro-mint",
        [balance(7, OWNER, 0, { mint: OTHER_MINT })],
        [balance(7, OWNER, 25, { mint: OTHER_MINT })],
      ),
    });
    publish(harness, {
      signature: "sig-decimal-9",
      addresses: [ATA],
      tx: parsedTx(
        "sig-decimal-9",
        [balance(7, OWNER, 0, { decimals: 9 })],
        [balance(7, OWNER, 25, { decimals: 9 })],
      ),
    });

    const summary = await syncSolanaUsdcDeposits(makeDeps(harness, { tokenAccounts: [ATA] }));

    expect(summary.confirmed).toBe(0);
    expect(harness.credits.size).toBe(0);
  });

  it("una tx fallida no acredita aunque el balance haya cambiado", async () => {
    const harness = newHarness();
    const onChainError = { InstructionError: [0, "Custom"] };
    publish(harness, {
      signature: "sig-failed",
      addresses: [ATA],
      tx: parsedTx("sig-failed", [balance(7, OWNER, 0)], [balance(7, OWNER, 25)], {
        err: onChainError,
      }),
      statusErr: onChainError,
    });

    const summary = await syncSolanaUsdcDeposits(makeDeps(harness, { tokenAccounts: [ATA] }));

    expect(summary.rejected).toBe(1);
    expect(summary.confirmed).toBe(0);
    expect(harness.credits.size).toBe(0);
  });

  it("un `processed` queda pendiente y NO entra al libro confirmado", async () => {
    const harness = newHarness();
    publish(harness, {
      signature: "sig-processed",
      addresses: [SECONDARY],
      tx: parsedTx("sig-processed", [balance(8, OWNER, 0)], [balance(8, OWNER, 15)]),
      confirmationStatus: "processed",
    });

    const summary = await syncSolanaUsdcDeposits(makeDeps(harness, { tokenAccounts: [SECONDARY] }));

    expect(summary.detected).toBe(1);
    expect(summary.confirmed).toBe(0);
    // El movimiento pending no es un crédito: el libro sigue vacío.
    expect(harness.movements.size).toBe(1);
    expect(harness.credits.size).toBe(0);
  });

  it("si el descubrimiento falla, la billetera se omite (fail closed)", async () => {
    const harness = newHarness();
    publish(harness, {
      signature: "sig-no-discovery",
      addresses: [OWNER],
      tx: parsedTx("sig-no-discovery", [balance(7, OWNER, 0)], [balance(7, OWNER, 25)]),
    });

    const summary = await syncSolanaUsdcDeposits(
      makeDeps(harness, {
        listOwnedTokenAccounts: async () => {
          throw new Error("RPC caído");
        },
      }),
    );

    expect(summary.ok).toBe(false);
    expect(summary.failedWallets).toBe(1);
    expect(summary.confirmed).toBe(0);
    expect(harness.credits.size).toBe(0);
    expect(summary.errors.join(" | ")).toContain("cuentas USDC");
  });

  it("más cuentas que el tope: se reportan las omitidas y no se escanean", async () => {
    const harness = newHarness();
    const many = Array.from({ length: DEPOSIT_SCAN_MAX_TOKEN_ACCOUNTS + 1 }, (_, i) => `cta-${i}`);
    const skipped = many[DEPOSIT_SCAN_MAX_TOKEN_ACCOUNTS] as string;
    publish(harness, {
      signature: "sig-fuera-de-tope",
      addresses: [skipped],
      tx: parsedTx("sig-fuera-de-tope", [balance(8, OWNER, 0)], [balance(8, OWNER, 30)]),
    });

    const summary = await syncSolanaUsdcDeposits(makeDeps(harness, { tokenAccounts: many }));

    expect(summary.tokenAccountsDiscovered).toBe(DEPOSIT_SCAN_MAX_TOKEN_ACCOUNTS);
    expect(summary.tokenAccountsSkipped).toBe(1);
    expect(summary.confirmed).toBe(0);
    expect(harness.credits.size).toBe(0);
  });
});
