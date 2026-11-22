/**
 * WEB-8: al cerrar sesión se borran del navegador los datos financieros o
 * personales que viven en `localStorage`/`sessionStorage` por persona.
 *
 * Las claves se repiten acá (no se importan de los componentes) para no meter
 * UI en el chunk de autenticación. Si cambian allá, hay que cambiarlas acá:
 *  - `mv_saved_recipients_v1[:<userId>|:anon]`: components/wallet/saved-recipients-bar.tsx
 *  - `<scope>:sessions_v1`: chats del asistente IA, components/ai/sessions-store.ts
 *  - `maverlang_limit_orders_v1`: lib/trade/limit-orders-store.ts
 *  - `a24_onb_draft`: borrador de onboarding con datos personales
 *    (app/(platform)/app/onboarding/draft.ts)
 *  - cualquier otra `maverlang_*` futura.
 * Preferencias de interfaz (moneda, ocultar saldo, favoritos) se conservan.
 */
export const PRIVATE_STORAGE_EXACT_KEYS: readonly string[] = [
  "maverlang_limit_orders_v1",
  "a24_onb_draft",
];

// `mv_ai_chat_v1`/`mv_ai_chat_v2*` (historial del asistente, components/ai/model.ts)
// y `mv_external_holdings` (posiciones externas, lib/portfolio/external-holdings.ts)
// también guardan datos financieros del usuario.
export const PRIVATE_STORAGE_PREFIXES: readonly string[] = [
  "mv_saved_recipients_v1",
  "maverlang_",
  "mv_ai_chat_v",
  "mv_external_holdings",
];

export const PRIVATE_STORAGE_SUFFIXES: readonly string[] = [":sessions_v1"];

export function isPrivateStorageKey(key: string): boolean {
  return (
    PRIVATE_STORAGE_EXACT_KEYS.includes(key) ||
    PRIVATE_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
    PRIVATE_STORAGE_SUFFIXES.some((suffix) => key.endsWith(suffix))
  );
}

function purgeStorage(storage: Storage): void {
  const doomed: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && isPrivateStorageKey(key)) doomed.push(key);
  }
  for (const key of doomed) storage.removeItem(key);
}

/** Borra las claves privadas de los dos almacenes. Nunca lanza (modo privado, cuota, bloqueo). */
export function purgePrivateBrowserStorage(): void {
  if (typeof window === "undefined") return;
  for (const kind of ["localStorage", "sessionStorage"] as const) {
    try {
      purgeStorage(window[kind]);
    } catch {
      // Almacenamiento bloqueado: no hay nada que purgar ni se rompe el cierre de sesión.
    }
  }
}
