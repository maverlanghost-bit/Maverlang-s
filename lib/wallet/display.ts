import { formatShares, formatUsd } from "@/lib/format";
import { formatSol } from "@/lib/wallet/send-cost";

/** USDC como dólar, SOL con unidad, acciones con el sufijo de la app. */
export function formatAssetAmount(symbol: string, amount: number): string {
  if (symbol === "USDC") return formatUsd(amount);
  if (symbol === "SOL") return formatSol(amount);
  return formatShares(amount);
}
