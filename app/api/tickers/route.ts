import { TICKERS } from "@/config/tickers";
import { tickersResponseSchema } from "@/lib/api/contracts";
import { handle, readOutput } from "@/lib/api/handler";

export const runtime = "nodejs";
/** Catálogo del allowlist. §5 no tiene servicio de tickers. */
export const revalidate = 3600;

export function GET() {
  return handle("hour", async () => readOutput(tickersResponseSchema, TICKERS));
}
