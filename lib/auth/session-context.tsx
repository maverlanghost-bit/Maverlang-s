"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { SessionValue } from "@/lib/auth/types";

const SessionContext = createContext<SessionValue | null>(null);

const loadingSession: SessionValue = {
  status: "loading",
  user: null,
  login: async () => {},
  logout: async () => {},
};

export function SessionProvider({ value, children }: { value: SessionValue; children: ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Sesión mientras carga el chunk de Privy. No autentica. */
export function LoadingSession({ children }: { children: ReactNode }) {
  const value = useMemo(() => loadingSession, []);
  return <SessionProvider value={value}>{children}</SessionProvider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession debe usarse dentro de AuthProvider.");
  }
  return value;
}
