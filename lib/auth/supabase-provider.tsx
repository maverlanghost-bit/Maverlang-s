"use client";

import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { clearClientCookie } from "@/lib/auth/browser-cookies";
import { MOCK_ONBOARDING_COOKIE, MOCK_SESSION_COOKIE } from "@/lib/auth/cookies";
import { ExportWalletProvider, exportMockWallet } from "@/lib/auth/export-wallet";
import { SessionProvider } from "@/lib/auth/session-context";
import { SignerProvider, signMockTransaction } from "@/lib/auth/sign-transaction";
import type { LinkedLogin, SessionStatus, SessionUser, SessionValue } from "@/lib/auth/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function displayName(user: User): string | null {
  const meta = user.user_metadata;
  if (!meta || typeof meta !== "object") return null;
  const record = meta as Record<string, unknown>;
  const name = record.full_name ?? record.name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    email: user.email ?? null,
    displayName: displayName(user),
    walletAddress: null,
  };
}

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [status, setStatus] = useState<SessionStatus>(supabase ? "loading" : "unauthenticated");
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user ? toSessionUser(session.user) : null;
      setUser(next);
      setStatus(next ? "authenticated" : "unauthenticated");
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const login = useCallback(async () => {
    router.push("/app/ingresar");
  }, [router]);

  const logout = useCallback(async () => {
    clearClientCookie(MOCK_SESSION_COOKIE);
    clearClientCookie(MOCK_ONBOARDING_COOKIE);
    try {
      await supabase?.auth.signOut();
    } finally {
      router.push("/");
      router.refresh();
    }
  }, [router, supabase]);

  const linkedLogins = useMemo<LinkedLogin[]>(() => {
    const email = user?.email ?? null;
    return email ? [{ method: "email", detail: email }] : [];
  }, [user]);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      user: status === "authenticated" ? user : null,
      login,
      logout,
      linkedLogins: status === "authenticated" ? linkedLogins : [],
    }),
    [status, user, login, logout, linkedLogins],
  );

  return (
    <SessionProvider value={value}>
      <SignerProvider sign={signMockTransaction}>
        <ExportWalletProvider exportWallet={exportMockWallet}>{children}</ExportWalletProvider>
      </SignerProvider>
    </SessionProvider>
  );
}
