import { z } from "zod";
import { LIMIT_DECIMAL_PATTERN } from "@/lib/trade/stock-limit-terms";

const decimal = z.string().regex(LIMIT_DECIMAL_PATTERN);
const side = z.enum(["buy", "sell"]);

export const stockLimitPreviewRequestSchema = z.strictObject({
  symbol: z.string().trim().min(1).max(24),
  side,
  // Compra por monto en USDC. Venta por cantidad de acciones mostradas.
  amount: decimal,
  limitPriceUsdc: decimal,
});

export const stockLimitPreviewSchema = z.object({
  symbol: z.string(),
  side,
  limitPriceUsdc: decimal,
  inputMint: z.string(),
  outputMint: z.string(),
  inputAtoms: z.string().regex(/^[1-9]\d{0,19}$/),
  minimumOutputAtoms: z.string().regex(/^[1-9]\d{0,19}$/),
  stockDecimals: z.number().int().min(0).max(18),
  multiplier: z.number().positive(),
  observedSlot: z.number().int().nonnegative(),
  observedAtUnix: z.number().int().positive(),
  nextMultiplierAtUnix: z.number().int().positive().nullable(),
});

export type StockLimitPreviewRequest = z.infer<typeof stockLimitPreviewRequestSchema>;
export type StockLimitPreview = z.infer<typeof stockLimitPreviewSchema>;
