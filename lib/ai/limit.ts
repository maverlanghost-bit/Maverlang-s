import "server-only";

import { limit, resolvePolicy, type RateLimitPolicyName } from "@/lib/security/rate-limit";

export type AiQuotaResult =
  | { ok: true; remaining: number }
  | {
      ok: false;
      resetMs: number;
      unavailable?: boolean;
      /** Qué tope se alcanzó. `global` se informa como servicio no disponible. */
      reason?: "burst" | "daily" | "images" | "global";
    };

/**
 * Sujeto de cuota único por persona: `maverlang:rl:ai:<userId>` para el chat y
 * la importación por foto. Acepta el id pelado o `user:<id>` / `ip:<ip>`.
 */
export function aiQuotaSubject(subject: string): string {
  const trimmed = subject.trim();
  const bare = trimmed.startsWith("user:") ? trimmed.slice("user:".length) : trimmed;
  return bare.replace(/:/g, "_").slice(0, 200) || "unknown";
}

/**
 * Costo del asistente (WEB-2). Cada llamada consume, en este orden y en Redis:
 * ráfaga por usuario (20 / 10 min), tope diario por usuario (100), tope diario
 * de imágenes (20, sólo si lleva imagen) y el disyuntor global (5000 / día).
 * Los topes por usuario se revisan antes del global para que un usuario
 * bloqueado no gaste presupuesto de los demás. Las políticas son sensibles:
 * en producción sin Redis se falla cerrado.
 */
export async function takeAiQuota(
  subject: string,
  options: { image?: boolean } = {},
): Promise<AiQuotaResult> {
  const safe = aiQuotaSubject(subject);
  const steps: { key: string; policy: RateLimitPolicyName; reason: "burst" | "daily" | "images" | "global" }[] = [
    { key: `maverlang:rl:ai:${safe}`, policy: "ai", reason: "burst" },
    { key: `maverlang:rl:aiDaily:${safe}`, policy: "aiDaily", reason: "daily" },
  ];
  if (options.image) {
    steps.push({ key: `maverlang:rl:aiImageDaily:${safe}`, policy: "aiImageDaily", reason: "images" });
  }
  steps.push({ key: "maverlang:rl:aiGlobalDaily:all", policy: "aiGlobalDaily", reason: "global" });

  let remaining = Number.POSITIVE_INFINITY;
  for (const step of steps) {
    const result = await limit(step.key, resolvePolicy(step.policy), step.policy);
    if (!result.ok) {
      return {
        ok: false,
        resetMs: result.resetMs,
        unavailable: result.unavailable || step.reason === "global" ? true : undefined,
        reason: step.reason,
      };
    }
    remaining = Math.min(remaining, result.remaining);
  }
  return { ok: true, remaining: Number.isFinite(remaining) ? remaining : 0 };
}
