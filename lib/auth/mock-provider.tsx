"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";

import {
  clearClientCookie,
  readBrowserCookie,
  subscribeAuthCookies,
  writeClientCookie,
} from "@/lib/auth/browser-cookies";
import { MOCK_ONBOARDING_COOKIE, MOCK_SESSION_COOKIE } from "@/lib/auth/cookies";
import { DEMO_SESSION_USER } from "@/lib/auth/demo-user";
import { ExportWalletProvider, exportMockWallet } from "@/lib/auth/export-wallet";
import { SessionProvider } from "@/lib/auth/session-context";
import { SignerProvider, signMockTransaction } from "@/lib/auth/sign-transaction";
import type { LinkedLogin, SessionStatus, SessionUser, SessionValue } from "@/lib/auth/types";

type Snapshot = { status: SessionStatus; user: SessionUser | null };

const LOADING: Snapshot = { status: "loading", user: null };
const ANONYMOUS: Snapshot = { status: "unauthenticated", user: null };
const DEMO: Snapshot = { status: "authenticated", user: DEMO_SESSION_USER };

let cachedKey = "";
let cachedSnapshot: Snapshot = ANONYMOUS;

function readSnapshot(): Snapshot {
  const key = readBrowserCookie(MOCK_SESSION_COOKIE) ?? "";
  if (key === cachedKey) return cachedSnapshot;
  cachedKey = key;
  cachedSnapshot = key ? DEMO : ANONYMOUS;
  return cachedSnapshot;
}

export function MockAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const snapshot = useSyncExternalStore(subscribeAuthCookies, readSnapshot, () => LOADING);

  const login = useCallback(async () => {
    writeClientCookie(MOCK_SESSION_COOKIE, "1");
  }, []);

  const logout = useCallback(async () => {
    clearClientCookie(MOCK_SESSION_COOKIE);
    clearClientCookie(MOCK_ONBOARDING_COOKIE);
    router.push("/");
    router.refresh();
  }, [router]);

  const linkedLogins = useMemo<LinkedLogin[]>(() => {
    const email = snapshot.user?.email ?? null;
    return email ? [{ method: "email", detail: email }] : [];
  }, [snapshot.user]);

  const value = useMemo<SessionValue>(
    () => ({
      status: snapshot.status,
      user: snapshot.user,
      login,
      logout,
      linkedLogins,
    }),
    [snapshot, login, logout, linkedLogins],
  );

  return (
    <SessionProvider value={value}>
      <SignerProvider sign={signMockTransaction}>
        <ExportWalletProvider exportWallet={exportMockWallet}>{children}</ExportWalletProvider>
      </SignerProvider>
    </SessionProvider>
  );
}
