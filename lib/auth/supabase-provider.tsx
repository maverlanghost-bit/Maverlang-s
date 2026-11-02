"use client";

import type { User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { clearClientCookie } from "@/lib/auth/browser-cookies";
import { MOCK_ONBOARDING_COOKIE, MOCK_SESSION_COOKIE } from "@/lib/auth/cookies";
import { ExportWalletProvider, unavailableExportWallet } from "@/lib/auth/export-wallet";
import { purgePrivateQueryCache } from "@/lib/auth/private-cache";
import { SessionProvider } from "@/lib/auth/session-context";
import { SignerProvider, type SignTrade } from "@/lib/auth/sign-transaction";
import type { LinkedLogin, SessionStatus, SessionUser, SessionValue } from "@/lib/auth/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function displayName(user: User): string | null {
  const meta = user.user_metadata;
  if (!meta || typeof meta !== "object") return null;
  const record = meta as Record<string, unknown>;
  const name = record.nombre ?? record.full_name ?? record.name;
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

/**
 * Con sesión Supabase no hay firma local: hasta que una billetera Solana esté
 * vinculada y verificada en el servidor, cualquier intento de firmar falla.
 * No se usa `signDemoTransaction` aquí para no aparentar una firma real.
 */
const rejectSign: SignTrade = async () => {
  throw new Error("NO_WALLET");
};

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [status, setStatus] = useState<SessionStatus>(supabase ? "loading" : "unauthenticated");
  const [user, setUser] = useState<SessionUser | null>(null);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user ? toSessionUser(session.user) : null;
      const nextId = next?.id ?? null;
      const changed = lastUserId.current !== nextId;
      lastUserId.current = nextId;

      // Antes de publicar el usuario nuevo se descarta la caché privada del
      // anterior. Un `TOKEN_REFRESHED` del mismo usuario no la toca.
      if (changed) void purgePrivateQueryCache(queryClient);

      setUser(next);
      setStatus(next ? "authenticated" : "unauthenticated");
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [queryClient, supabase]);

  const login = useCallback(async () => {
    router.push("/app/ingresar");
  }, [router]);

  const logout = useCallback(async () => {
    clearClientCookie(MOCK_SESSION_COOKIE);
    clearClientCookie(MOCK_ONBOARDING_COOKIE);
    try {
      await supabase?.auth.signOut();
    } catch {
      // Si falla el cierre global, se intenta el local; la limpieza de datos
      // privados ocurre igual en el `finally`.
      await supabase?.auth.signOut({ scope: "local" });
    } finally {
      await purgePrivateQueryCache(queryClient);
      router.push("/");
      router.refresh();
    }
  }, [queryClient, router, supabase]);

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
      <SignerProvider sign={rejectSign}>
        <ExportWalletProvider exportWallet={unavailableExportWallet}>{children}</ExportWalletProvider>
      </SignerProvider>
    </SessionProvider>
  );
}
