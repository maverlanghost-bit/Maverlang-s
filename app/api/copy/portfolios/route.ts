import { handle, isUserDemoRequest, parseQuery } from "@/lib/api/handler";
import {
  copyFeatureDisabled,
  copyPortfoliosQuerySchema,
} from "@/lib/copy/contracts";
import { getCopyIndex } from "@/lib/copy/feed";
import { isCopyEnabled } from "@/lib/copy/flags";
import { withRateLimit } from "@/lib/security/rate-limit";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/copy/portfolios
 *
 * Metadatos del índice para todos (§1.10): nombre, gestor, familia, fechas,
 * atraso y cobertura. Ni una posición: la composición vive sólo en la ficha y
 * en el plan, siempre detrás del paywall.
 * Con `copy_enabled` apagado responde 404 `FEATURE_DISABLED` sin datos.
 */
export function GET(req: Request) {
  return handle("private", async () => {
    if (!(await isCopyEnabled())) return copyFeatureDisabled();
    const services = getServices();
    const session = await services.auth.getSession(req);
    const limited = await withRateLimit(req, "me", session ? [session.userId] : []);
    if (limited) return limited;
    const { family } = parseQuery(req, copyPortfoliosQuerySchema);
    const { entries, health } = await getCopyIndex({ allowFixtures: isUserDemoRequest(req) });
    const rows = family ? entries.filter((entry) => entry.family === family) : entries;
    return { entries: rows, health };
  });
}
