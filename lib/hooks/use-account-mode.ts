"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import {
  ACCOUNT_COOKIE,
  parseAccountMode,
  serializeAccountCookie,
  type AccountMode,
} from "@/lib/account/mode";
import { readBrowserCookie } from "@/lib/auth/browser-cookies";

/** La interfaz sólo opera la demo. Una cookie vieja en `real` no cambia la pantalla. */
function activeMode(mode: AccountMode): AccountMode {
  return mode === "real" ? "demo" : mode;
}

/** Corre al cargar el módulo en el navegador, antes de las consultas de la cartera. */
function ensureDemoCookie(): void {
  if (typeof document === "undefined") return;
  const fromCookie = readBrowserCookie(ACCOUNT_COOKIE);
  if (parseAccountMode(fromCookie) !== "real") return;
  document.cookie = serializeAccountCookie("demo");
}

ensureDemoCookie();

/**
 * Modo de cuenta en el cliente. Arranca en `initial` (lo que el servidor
 * leyó de la cookie) y se queda en demo: pulsar «Cuenta real» no escribe
 * la cookie. Si quedó `mv_account=real` de antes, se vuelve a demo.
 */
export function useAccountMode(initial: AccountMode = "demo") {
  const router = useRouter();
  // El servidor ya leyó la cookie para el primer HTML (sin flash).
  // El inicializador perezoso re-lee `document.cookie` en el cliente
  // para alinear sin un efecto con setState.
  const [mode, setMode] = useState<AccountMode>(() => {
    if (typeof document === "undefined") return activeMode(initial);
    const fromCookie = readBrowserCookie(ACCOUNT_COOKIE);
    return activeMode(fromCookie ? parseAccountMode(fromCookie) : initial);
  });

  const select = useCallback(
    (next: AccountMode) => {
      if (next !== "demo") return;
      setMode("demo");
      document.cookie = serializeAccountCookie("demo");
      router.refresh();
    },
    [router],
  );

  return { mode, select };
}

/** Lee la cookie una vez (render). Para el primer HTML usa el `initial` del servidor. */
export function readAccountModeCookie(): AccountMode {
  return parseAccountMode(readBrowserCookie(ACCOUNT_COOKIE));
}
