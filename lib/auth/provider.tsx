"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";

import { LoadingSession } from "@/lib/auth/session-context";
import { MockAuthProvider } from "@/lib/auth/mock-provider";
import { clientAuthModeInput, isSupabaseAuth, shouldUsePrivy } from "@/lib/auth/mode";

/**
 * Mock por defecto. Supabase manda si el modo público es supabase y hay claves.
 * Privy se carga sólo en live con app id, y no si ya manda Supabase.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (isSupabaseAuth(clientAuthModeInput())) return <SupabaseSlot>{children}</SupabaseSlot>;
  if (!shouldUsePrivy()) return <MockAuthProvider>{children}</MockAuthProvider>;
  return <PrivySlot>{children}</PrivySlot>;
}

function SupabaseSlot({ children }: { children: ReactNode }) {
  const [Provider, setProvider] = useState<ComponentType<{ children: ReactNode }> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("./supabase-provider").then((mod) => {
      if (!cancelled) setProvider(() => mod.SupabaseAuthProvider);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!Provider) return <LoadingSession>{children}</LoadingSession>;
  return <Provider>{children}</Provider>;
}

function PrivySlot({ children }: { children: ReactNode }) {
  const [Provider, setProvider] = useState<ComponentType<{ children: ReactNode }> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("./privy-provider").then((mod) => {
      if (!cancelled) setProvider(() => mod.PrivyAuthProvider);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!Provider) return <LoadingSession>{children}</LoadingSession>;
  return <Provider>{children}</Provider>;
}
