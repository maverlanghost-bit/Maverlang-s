/**
 * Arranque del servidor (M59). Valida las variables de entorno antes de
 * atender pedidos: en modo estricto (`APP_ENV=production` explícito o
 * `SUPABASE_PROJECT_ENV=prod`; `APP_ENV=preview` para preview) con
 * faltantes, el arranque falla. Sin esas variables explícitas la app corre
 * como demo pública/desarrollo: sólo avisa (`console.warn`).
 *
 * Guía: `node_modules/next/dist/docs/01-app/02-guides/instrumentation.md`
 * (`instrumentation.ts` en la raíz, exporta `register`, una llamada por
 * instancia antes de atender; el import va dentro de `register`).
 */
export async function register(): Promise<void> {
  const { assertServerEnv } = await import("@/lib/env");
  assertServerEnv();
}
