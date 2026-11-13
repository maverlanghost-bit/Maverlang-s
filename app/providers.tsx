"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";

import { ToastProvider } from "@/components/ui/toast";
import { queryRetry } from "@/lib/api/retry";
import {
  BridgedSession,
  SessionProvider,
  SessionReporter,
  type AuthBridgeValue,
} from "@/lib/auth/session-context";
import type { SessionValue } from "@/lib/auth/types";

/** Privy y Supabase sólo en la plataforma. El marketing queda con una sesión invitada. */
function needsAccount(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/") || pathname === "/admin" || pathname.startsWith("/admin/");
}

const guestSession: SessionValue = {
  status: "unauthenticated",
  user: null,
  login: async () => {},
  logout: async () => {},
  linkedLogins: [],
};

function GuestSession({ children }: { children: ReactNode }) {
  const value = useMemo(() => guestSession, []);
  return <SessionProvider value={value}>{children}</SessionProvider>;
}

/**
 * El chunk de auth no entra al marketing. Mientras llega, la plataforma pinta
 * igual. La app queda siempre bajo `BridgedSession` (misma posición y tipos);
 * el provider de cuenta se monta al lado y sólo publica su sesión. Si la app
 * fuera hija del provider, el cambio de `LoadingSession` al provider real la
 * desmontaría y montaría de nuevo al cargar (foco y estado perdidos).
 */
function AccountShell({ children }: { children: ReactNode }) {
  const [Provider, setProvider] = useState<ComponentType<{ children: ReactNode }> | null>(null);
  const [bridge, setBridge] = useState<AuthBridgeValue | null>(null);
  useEffect(() => {
    let cancelled = false;
    void import("@/lib/auth/provider").then((mod) => {
      if (!cancelled) setProvider(() => mod.AuthProvider);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <>
      <BridgedSession value={bridge}>{children}</BridgedSession>
      {Provider ? (
        <Provider>
          <SessionReporter onChange={setBridge} />
        </Provider>
      ) : null}
    </>
  );
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: queryRetry,
        refetchOnWindowFocus: false,
        staleTime: 5_000,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

/**
 * Sólo este subárbol depende de la ruta. Así, navegar dentro de la app no
 * re-renderiza `QueryClientProvider` ni `ToastProvider` (cuyo valor de
 * contexto se recrea y arrastraría a todos los `useToast`).
 */
function SessionGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const account = needsAccount(pathname);
  return account ? <AccountShell>{children}</AccountShell> : <GuestSession>{children}</GuestSession>;
}

/** QueryClient y toasts en toda la app. La sesión real sólo entra en /app y /admin. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <ToastProvider>
        <SessionGate>{children}</SessionGate>
      </ToastProvider>
    </QueryClientProvider>
  );
}
