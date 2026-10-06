import "server-only";

import { cookies } from "next/headers";

import { ACCOUNT_COOKIE, parseAccountMode, type AccountMode } from "@/lib/account/mode";

/** Modo de cuenta para el primer HTML (sidebar/top-bar sin flash). */
export async function readAccountMode(): Promise<AccountMode> {
  const jar = await cookies();
  return parseAccountMode(jar.get(ACCOUNT_COOKIE)?.value);
}

/** Modo de cuenta dentro de un route handler (`Request` con cabecera cookie). */
export function requestAccountMode(req: Request): AccountMode {
  const header = req.headers.get("cookie");
  if (!header) return "demo";
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== ACCOUNT_COOKIE) continue;
    return parseAccountMode(part.slice(separator + 1).trim());
  }
  return "demo";
}
