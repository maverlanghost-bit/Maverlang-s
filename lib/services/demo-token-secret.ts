import "server-only";

import { DomainError } from "@/lib/api/result";
import { isProductionAuthRuntime } from "@/lib/auth/mode";
import { serverEnv } from "@/lib/env";

/** Sólo desarrollo/tests: nunca se usa en producción (MON-11). */
const DEV_ONLY_DEMO_TOKEN_SECRET = "dev-only-demo-token-secret-not-for-production";

/**
 * MON-11: los tokens demo se firman con `DEMO_TOKEN_SECRET` dedicado, nunca con
 * la service key ni `CRON_SECRET`. En producción, sin secreto falla cerrado.
 */
export function demoHmacSecret(): string {
  const secret = serverEnv.DEMO_TOKEN_SECRET?.trim();
  if (secret) return secret;
  if (isProductionAuthRuntime()) throw new DomainError("REAL_DISABLED");
  return DEV_ONLY_DEMO_TOKEN_SECRET;
}
