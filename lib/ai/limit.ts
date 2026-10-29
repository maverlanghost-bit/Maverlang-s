import "server-only";

import { limit, resolvePolicy } from "@/lib/security/rate-limit";

/**
 * 20 solicitudes cada 10 minutos. La clave sigue el formato de
 * `withRateLimit` (`maverlang:rl:ai:…`) y usa la primitiva `limit`.
 */
export async function takeAiQuota(subject: string): Promise<{ ok: true; remaining: number } | { ok: false; resetMs: number }> {
  const policy = resolvePolicy("ai");
  const safe = subject.trim().replace(/:/g, "_").slice(0, 200) || "unknown";
  const result = await limit(`maverlang:rl:ai:${safe}`, policy);
  if (!result.ok) return { ok: false, resetMs: result.resetMs };
  return { ok: true, remaining: result.remaining };
}
