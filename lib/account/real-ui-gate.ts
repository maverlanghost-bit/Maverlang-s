/**
 * Interruptor de la UI de cuenta real.
 *
 * Se lee de `NEXT_PUBLIC_REAL_ACCOUNT_ENABLED` para que funcione tanto en
 * componentes de cliente como en el servidor, sin imports ni efectos.
 *
 * Por defecto (tests, env sin definir) el modo `"real"` sigue mostrando
 * `<RealAccountEmpty />`: la cuenta real queda bloqueada hasta que se active
 * explícitamente. Con `NEXT_PUBLIC_REAL_ACCOUNT_ENABLED="true"` se desbloquean
 * las pantallas reales (cartera, billetera, compra/venta, etc.).
 */
export function isRealAccountUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_REAL_ACCOUNT_ENABLED === "true";
}

/** `true` sólo cuando el modo es `"real"` y el interruptor está apagado. */
export function isRealAccountUiBlocked(mode: "demo" | "real"): boolean {
  return mode === "real" && !isRealAccountUiEnabled();
}
