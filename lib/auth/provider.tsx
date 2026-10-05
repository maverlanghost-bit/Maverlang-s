"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";

import { LoadingSession } from "@/lib/auth/session-context";
import { MockAuthProvider } from "@/lib/auth/mock-provider";
import { shouldUsePrivy } from "@/lib/auth/mode";

/**
 * Mock por defecto. El SDK de Privy se carga sólo en live con app id,
 * para que el modo mock no lo inicialice.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!shouldUsePrivy()) return <MockAuthProvider>{children}</MockAuthProvider>;
  return <PrivySlot>{children}</PrivySlot>;
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
