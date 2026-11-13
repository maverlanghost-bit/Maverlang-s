"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

import { ExportWalletProvider, useExportKey, type ExportWallet } from "@/lib/auth/export-wallet";
import { usePrivateSessionCache } from "@/lib/auth/private-cache";
import { SignerProvider, useSignTrade, type SignTrade } from "@/lib/auth/sign-transaction";
import type { SessionValue } from "@/lib/auth/types";

const SessionContext = createContext<SessionValue | null>(null);

const loadingSession: SessionValue = {
  status: "loading",
  user: null,
  login: async () => {},
  logout: async () => {},
  linkedLogins: [],
};

const unavailableExport: ExportWallet = async () => {
  throw new Error("NO_WALLET");
};

export function SessionProvider({ value, children }: { value: SessionValue; children: ReactNode }) {
  // Datos privados de la cuenta en React Query: nunca sobreviven a un cambio
  // de usuario ni a un cierre de sesión. El mercado público se conserva.
  usePrivateSessionCache(value.status, value.user?.id ?? null);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Sesión mientras carga el chunk de Privy. No autentica. */
const rejectSign: SignTrade = async () => {
  throw new Error("NO_WALLET");
};

export function LoadingSession({ children }: { children: ReactNode }) {
  const value = useMemo(() => loadingSession, []);
  return (
    <SessionProvider value={value}>
      <SignerProvider sign={rejectSign}>
        <ExportWalletProvider exportWallet={unavailableExport}>{children}</ExportWalletProvider>
      </SignerProvider>
    </SessionProvider>
  );
}

/** Lo que publica el provider de cuenta (mock, Supabase o Privy) hacia la app. */
export type AuthBridgeValue = {
  session: SessionValue;
  sign: SignTrade;
  exportWallet: ExportWallet;
};

/**
 * Árbol de sesión estable para la app. Siempre son los mismos tres providers en
 * la misma posición: mientras no llega el provider de cuenta, entrega la sesión
 * "cargando" (igual que `LoadingSession`); después, lo que publica
 * `SessionReporter`. Así, cuando llega el chunk de auth, sólo cambian valores
 * de contexto y la app no se desmonta (antes se perdía el foco del teclado y el
 * estado de las pantallas ~0,7 s después de cargar).
 */
export function BridgedSession({ value, children }: { value: AuthBridgeValue | null; children: ReactNode }) {
  return (
    <SessionProvider value={value?.session ?? loadingSession}>
      <SignerProvider sign={value?.sign ?? rejectSign}>
        <ExportWalletProvider exportWallet={value?.exportWallet ?? unavailableExport}>{children}</ExportWalletProvider>
      </SignerProvider>
    </SessionProvider>
  );
}

/**
 * Se monta dentro del provider de cuenta (como hermano de la app, no como
 * padre) y publica su sesión, firmador y exportación hacia `BridgedSession`.
 */
export function SessionReporter({ onChange }: { onChange: (value: AuthBridgeValue) => void }) {
  const session = useSession();
  const sign = useSignTrade();
  const exportWallet = useExportKey();
  useEffect(() => {
    onChange({ session, sign, exportWallet });
  }, [onChange, session, sign, exportWallet]);
  return null;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession debe usarse dentro de AuthProvider.");
  }
  return value;
}
