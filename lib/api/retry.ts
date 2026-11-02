/**
 * Política de reintento de React Query (M49). Un 429 no se reintenta: el
 * servidor ya dijo cuándo volver con `Retry-After`. El resto, una vez.
 *
 * Vive fuera de `lib/api/client.ts` a propósito: `app/providers.tsx` está en
 * el layout raíz y sólo necesita esta regla. Importarla del cliente arrastra
 * zod y todos los contratos de `/api/*` al bundle compartido de todas las
 * rutas (marketing incluido). La comprobación es estructural para no depender
 * de la clase `ApiError` (que sigue exportándose desde el cliente).
 */
export function isRateLimitedError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "RATE_LIMITED"
  );
}

export function queryRetry(failureCount: number, error: unknown): boolean {
  if (isRateLimitedError(error)) return false;
  return failureCount < 1;
}
