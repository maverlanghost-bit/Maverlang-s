import "server-only";

/**
 * M78: indexación de depósitos USDC en Solana.
 *
 * Recibe transferencias SPL candidatas (lo que el RPC ya parseó) para la
 * billetera del usuario y deja pasar SÓLO depósitos USDC confirmados:
 * mint exacto de USDC, transacción sin error on-chain, destino igual a la
 * billetera (o a una cuenta de token aceptada del usuario) y monto
 * positivo. La firma de la transacción es la llave idempotente
 * (`signature` única en `crypto_deposits`): un depósito ya registrado
 * nunca se cuenta dos veces, ni dentro del lote ni entre corridas.
 *
 * PURO/INYECTABLE: no consulta la cadena ni la base por su cuenta. Las
 * firmas conocidas y el registro llegan por `deps` (producción cablea
 * `lib/services/deposits.supabase.ts`). Sin `deps` usa un registro en
 * memoria: determinista para `DATA_MODE=mock`, tests y demo.
 */

export const USDC_MINT_SOLANA = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_DECIMALS = 6;

export interface UsdcDepositCandidate {
  /** Firma de la transacción en Solana (llave idempotente). */
  signature: string;
  /** Mint de la transferencia SPL. */
  mint: string;
  /** Destino de la transferencia (billetera o cuenta de token). */
  destination: string;
  /** Monto ya convertido a UI (USDC). */
  amountUi: number;
  /** Error on-chain reportado por el RPC. `null` o ausente = la tx no falló. */
  err?: unknown;
  /** Billetera de origen, si el parseo la trae. */
  from?: string | null;
}

export interface IndexedUsdcDeposit {
  userId: string;
  mint: string;
  amountUi: number;
  signature: string;
  fromAddress: string | null;
}

export type DepositRejectReason =
  | "empty_signature"
  | "mint_not_usdc"
  | "tx_error_onchain"
  | "destination_mismatch"
  | "amount_not_positive";

export interface IndexDepositsDeps {
  /** Firmas ya registradas para el usuario (o globalmente). */
  listKnownSignatures: (userId: string) => Promise<Iterable<string>>;
  /** Registra el depósito. `false` si ya existía (idempotente por firma). */
  insertDeposit: (deposit: IndexedUsdcDeposit) => Promise<boolean>;
}

export interface IndexSolanaUsdcDepositsParams {
  userId: string;
  walletAddress: string;
  candidates: readonly UsdcDepositCandidate[];
  /** Cuentas de token (ATA u otras) que también cuentan como destino del usuario. */
  acceptedDestinations?: readonly string[];
  /** Firmas ya registradas; si viene, no se consulta `deps.listKnownSignatures`. */
  knownSignatures?: Iterable<string>;
  deps?: IndexDepositsDeps;
}

export interface IndexDepositsResult {
  indexed: IndexedUsdcDeposit[];
  duplicates: string[];
  rejected: Array<{ signature: string; reason: DepositRejectReason }>;
}

/** Registro en memoria del modo mock (determinista; sólo tests/desarrollo/demo). */
const mockDepositStore = new Map<string, IndexedUsdcDeposit>();

/** Sólo tests/desarrollo: limpia el registro en memoria del modo mock. */
export function resetDepositIndexerMockStoreForTests(): void {
  mockDepositStore.clear();
}

function inMemoryDepositDeps(): IndexDepositsDeps {
  return {
    listKnownSignatures: async () => [...mockDepositStore.keys()],
    insertDeposit: async (deposit) => {
      if (mockDepositStore.has(deposit.signature)) return false;
      mockDepositStore.set(deposit.signature, deposit);
      return true;
    },
  };
}

/** Producción (`DATA_MODE=live`): firma/registro en `crypto_deposits` vía Supabase. */
async function supabaseDepositDeps(): Promise<IndexDepositsDeps> {
  const service = await import("@/lib/services/deposits.supabase");
  return {
    listKnownSignatures: async (userId) => service.listDepositSignatures(userId),
    insertDeposit: async (deposit) =>
      service.insertCryptoDeposit({
        userId: deposit.userId,
        mint: deposit.mint,
        amountUi: deposit.amountUi,
        signature: deposit.signature,
        fromAddress: deposit.fromAddress,
      }),
  };
}

/** Sin variable → mock (mismo patrón que `requireWallet` en `lib/api/handler.ts`). */
function isLiveDataMode(): boolean {
  return (process.env.DATA_MODE?.trim() || "mock") === "live";
}

/** Monto crudo del RPC a UI (ARQUITECTURA §6: crudo × 10^-decimales). */
export function usdcRawToUi(raw: bigint | number): number {
  return Number(raw) / 10 ** USDC_DECIMALS;
}

/**
 * Filtra e indexa depósitos USDC confirmados para la wallet del usuario.
 * Determinista: mismas candidatas + mismas firmas conocidas → mismo
 * resultado; la única entrada externa es `deps`.
 */
export async function indexSolanaUsdcDeposits(
  params: IndexSolanaUsdcDepositsParams,
): Promise<IndexDepositsResult> {
  const deps = params.deps ?? (isLiveDataMode() ? await supabaseDepositDeps() : inMemoryDepositDeps());
  const known = new Set(params.knownSignatures ?? (await deps.listKnownSignatures(params.userId)));

  const wallet = params.walletAddress.trim();
  const accepted = new Set<string>((params.acceptedDestinations ?? []).map((d) => d.trim()));
  accepted.add(wallet);

  const indexed: IndexedUsdcDeposit[] = [];
  const duplicates: string[] = [];
  const rejected: IndexDepositsResult["rejected"] = [];

  for (const candidate of params.candidates) {
    const signature = typeof candidate.signature === "string" ? candidate.signature.trim() : "";
    if (!signature) {
      rejected.push({ signature: String(candidate.signature ?? ""), reason: "empty_signature" });
      continue;
    }
    // Sólo USDC (M78): cualquier otro mint se rechaza, aunque sea del catálogo.
    if (candidate.mint !== USDC_MINT_SOLANA) {
      rejected.push({ signature, reason: "mint_not_usdc" });
      continue;
    }
    // Transacción confirmada sin error on-chain.
    if (candidate.err !== null && candidate.err !== undefined) {
      rejected.push({ signature, reason: "tx_error_onchain" });
      continue;
    }
    // Destino: la wallet del usuario o una cuenta de token aceptada.
    if (typeof candidate.destination !== "string" || !accepted.has(candidate.destination.trim())) {
      rejected.push({ signature, reason: "destination_mismatch" });
      continue;
    }
    const amount = candidate.amountUi;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      rejected.push({ signature, reason: "amount_not_positive" });
      continue;
    }
    // Idempotencia por firma: ya registrado (o repetido en el lote) no se vuelve a contar.
    if (known.has(signature)) {
      duplicates.push(signature);
      continue;
    }
    const deposit: IndexedUsdcDeposit = {
      userId: params.userId,
      mint: USDC_MINT_SOLANA,
      amountUi: amount,
      signature,
      fromAddress: typeof candidate.from === "string" && candidate.from.trim() ? candidate.from.trim() : null,
    };
    let inserted: boolean;
    try {
      inserted = await deps.insertDeposit(deposit);
    } catch {
      // Falla al registrar (p. ej. carrera con otra corrida): se reintentará
      // en la siguiente pasada; no se reporta como indexado.
      inserted = false;
    }
    if (!inserted) {
      duplicates.push(signature);
      continue;
    }
    known.add(signature);
    indexed.push(deposit);
  }

  return { indexed, duplicates, rejected };
}
