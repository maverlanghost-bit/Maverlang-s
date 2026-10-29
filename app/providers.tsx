"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";

import { ToastProvider } from "@/components/ui/toast";
import { queryRetry } from "@/lib/api/client";
import { LoadingSession, SessionProvider } from "@/lib/auth/session-context";
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

/** El chunk de auth no entra al marketing. Mientras llega, la plataforma pinta igual. */
function AccountShell({ children }: { children: ReactNode }) {
  const [Provider, setProvider] = useState<ComponentType<{ children: ReactNode }> | null>(null);
  useEffect(() => {
    let cancelled = false;
    void import("@/lib/auth/provider").then((mod) => {
      if (!cancelled) setProvider(() => mod.AuthProvider);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!Provider) return <LoadingSession>{children}</LoadingSession>;
  return <Provider>{children}</Provider>;
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

/** QueryClient y toasts en toda la app. La sesión real sólo entra en /app y /admin. */
export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const account = needsAccount(pathname);
  return (
    <QueryClientProvider client={getQueryClient()}>
      <ToastProvider>
        {account ? <AccountShell>{children}</AccountShell> : <GuestSession>{children}</GuestSession>}
      </ToastProvider>
    </QueryClientProvider>
  );
}
