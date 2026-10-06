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

/**
 * Modo de cuenta demo/real en el cliente. Arranca en `initial` (lo que
 * el servidor leyó de la cookie: sin flash) y se sincroniza si la cookie
 * cambia. Al cambiar, escribe `mv_account` y refresca para que el
 * servidor sirva la cartera de esa cuenta.
 */
export function useAccountMode(initial: AccountMode = "demo") {
  const router = useRouter();
  // El servidor ya leyó la cookie para el primer HTML (sin flash).
  // El inicializador perezoso re-lee `document.cookie` en el cliente
  // para alinear sin un efecto con setState.
  const [mode, setMode] = useState<AccountMode>(() => {
    if (typeof document === "undefined") return initial;
    const fromCookie = readBrowserCookie(ACCOUNT_COOKIE);
    return fromCookie ? parseAccountMode(fromCookie) : initial;
  });

  const select = useCallback(
    (next: AccountMode) => {
      setMode(next);
      document.cookie = serializeAccountCookie(next);
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
