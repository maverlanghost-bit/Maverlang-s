/**
 * M73: chequeo PREVIO de gas en SOL antes de cotizar/firmar. PURO: sin
 * red y sin env; el saldo lo trae un `getLamportsBalance` inyectable
 * (RPC en producción, un stub en tests). Lo consume la hoja de compra
 * para avisar ANTES de firmar, no después de que falle la red.
 *
 * Modelo de costos (lamports):
 * - Comisión base de la transacción: 10_000 (0,00001 SOL).
 * - Renta de la cuenta de token (ATA) Token-2022 cuando es la primera
 *   compra de ese activo: ~2_157_600 (el RPC la cobra exacta).
 * - Colchón mínimo por fluctuación de fees y subastas de prioridad.
 *
 * Si hay patrocinador (`sponsorAvailable`), el usuario necesita 0 SOL
 * propios: el fee-payer de Maverlang cubre comisión y renta.
 */

/** 1 SOL = 1_000_000_000 lamports. */
export const LAMPORTS_PER_SOL = 1_000_000_000;
/** Comisión base de una transacción de Solana. */
export const BASE_TX_FEE_LAMPORTS = 10_000;
/** Renta de exención de una cuenta de token asociada (ATA) Token-2022. */
export const ATA_RENT_EXEMPT_LAMPORTS = 2_157_600;
/**
 * Colchón mínimo encima de comisión + renta (0,001 SOL), coherente con
 * el margen de la estimación de M73; absorbe priorización y variación.
 */
export const GAS_CUSHION_LAMPORTS = 1_000_000;

export interface SolGasCheckInput {
  walletAddress: string;
  /** Primera compra del activo: hay que abrir la cuenta de token. */
  requiresNewAta?: boolean;
  /** Fee-payer de Maverlang disponible: el usuario no paga gas. */
  sponsorAvailable?: boolean;
  /** Saldo en lamports de la billetera; `null`/fallo = saldo desconocido. */
  getLamportsBalance?: (address: string) => Promise<number | null>;
}

export interface SolGasCheckResult {
  ok: boolean;
  /** Sólo con `ok: false`: siempre `INSUFFICIENT_SOL_GAS`. */
  code?: "INSUFFICIENT_SOL_GAS";
  requiredLamports: number;
  /** `null` cuando no se pudo leer el saldo (o hay patrocinio). */
  currentLamports: number | null;
  deficitLamports: number;
  sponsored: boolean;
  userMessage: string;
}

function formatSol(lamports: number): string {
  return new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(lamports / LAMPORTS_PER_SOL);
}

/** Lamports mínimos que la billetera del usuario debe tener para la tx. */
export function requiredGasLamports(requiresNewAta = false): number {
  return (
    BASE_TX_FEE_LAMPORTS + (requiresNewAta ? ATA_RENT_EXEMPT_LAMPORTS : 0) + GAS_CUSHION_LAMPORTS
  );
}

/**
 * Verifica el gas antes de cotizar. Fail-open en la LECTURA del saldo:
 * si no hay proveedor o el RPC falla, devuelve `ok: true` con
 * `currentLamports: null` (una falla de lectura nunca bloquea la
 * compra). Sólo `ok: false` cuando se leyó el saldo y NO alcanza.
 */
export async function checkSolGasRequirement(input: SolGasCheckInput): Promise<SolGasCheckResult> {
  if (input.sponsorAvailable === true) {
    return {
      ok: true,
      requiredLamports: 0,
      currentLamports: null,
      deficitLamports: 0,
      sponsored: true,
      userMessage: "La comisión de la red la paga Maverlang: solo necesitas saldo en dólares (USDC).",
    };
  }

  const requiredLamports = requiredGasLamports(input.requiresNewAta === true);
  const base: Omit<SolGasCheckResult, "ok" | "currentLamports" | "userMessage" | "code" | "deficitLamports"> = {
    requiredLamports,
    sponsored: false,
  };

  if (typeof input.getLamportsBalance !== "function" || !input.walletAddress?.trim()) {
    return { ...base, ok: true, currentLamports: null, deficitLamports: 0, userMessage: "" };
  }

  let currentLamports: number | null = null;
  try {
    currentLamports = await input.getLamportsBalance(input.walletAddress.trim());
  } catch {
    currentLamports = null;
  }
  if (currentLamports === null || !Number.isFinite(currentLamports) || currentLamports < 0) {
    return { ...base, ok: true, currentLamports: null, deficitLamports: 0, userMessage: "" };
  }
  if (currentLamports >= requiredLamports) {
    return { ...base, ok: true, currentLamports, deficitLamports: 0, userMessage: "" };
  }

  const deficitLamports = requiredLamports - currentLamports;
  return {
    ...base,
    ok: false,
    code: "INSUFFICIENT_SOL_GAS",
    currentLamports,
    deficitLamports,
    userMessage: `No te alcanza el SOL para pagar la comisión de la red. Necesitas unos ${formatSol(requiredLamports)} SOL (hoy tienes ${formatSol(currentLamports)} SOL). Puedes comprar un poco de SOL con tu saldo en dólares (USDC).`,
  };
}
