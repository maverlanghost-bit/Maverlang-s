"use client";

import {
  PrivyProvider,
  usePrivy,
  type PrivyClientConfig,
  type User,
  type WalletWithMetadata,
} from "@privy-io/react-auth";
import { useExportWallet } from "@privy-io/react-auth/solana";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, type ReactNode } from "react";

import { clearClientCookie } from "@/lib/auth/browser-cookies";
import { MOCK_ONBOARDING_COOKIE, MOCK_SESSION_COOKIE } from "@/lib/auth/cookies";
import { ExportWalletProvider, type ExportWallet } from "@/lib/auth/export-wallet";
import { privyAppId } from "@/lib/auth/mode";
import { MockAuthProvider } from "@/lib/auth/mock-provider";
import { PrivyTradeSigner } from "@/lib/auth/privy-signer";
import { SessionProvider } from "@/lib/auth/session-context";
import type { LinkedLogin, LoginMethod, SessionUser, SessionValue } from "@/lib/auth/types";

/**
 * Nombres verificados en `@privy-io/react-auth` 3.47 (`PrivyClientConfig`):
 * `loginMethods` y `embeddedWallets.solana.createOnLogin` (`users-without-wallets` | `all-users` | `off`).
 * La wallet se crea al entrar por el modal de Privy, no por los hooks headless.
 */
const privyConfig: PrivyClientConfig = {
  loginMethods: ["email", "google"],
  appearance: {
    theme: "light",
    accentColor: "#ff6a08",
    walletChainType: "solana-only",
    showWalletLoginFirst: false,
    landingHeader: "Ingresa o crea tu cuenta",
  },
  embeddedWallets: {
    solana: {
      createOnLogin: "users-without-wallets",
    },
  },
};

type SolanaWallet = WalletWithMetadata & { chainType: "solana" };

function isSolanaWallet(account: User["linkedAccounts"][number]): account is SolanaWallet {
  return account.type === "wallet" && account.chainType === "solana";
}

function solanaAddress(user: User): string | null {
  const wallets = user.linkedAccounts.filter(isSolanaWallet);
  const embedded = wallets.find(
    (account) => account.walletClientType === "privy" || account.walletClientType === "privy-v2",
  );
  return (embedded ?? wallets[0])?.address ?? null;
}

function toLinkedLogins(user: User | null): LinkedLogin[] {
  if (!user) return [];
  const rows: LinkedLogin[] = [];
  if (user.email?.address) rows.push({ method: "email", detail: user.email.address });
  if (user.google) rows.push({ method: "google", detail: user.google.email ?? user.google.name ?? null });
  return rows;
}

function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    email: user.email?.address ?? user.google?.email ?? null,
    displayName: user.google?.name ?? null,
    walletAddress: solanaAddress(user),
  };
}

function PrivySession({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { exportWallet } = useExportWallet();
  const sessionUser = user ? toSessionUser(user) : null;
  const linkedLogins = useMemo(() => (authenticated && user ? toLinkedLogins(user) : []), [authenticated, user]);
  const address = sessionUser?.walletAddress ?? null;

  const exportKey = useCallback<ExportWallet>(async () => {
    await exportWallet(address ? { address } : undefined);
    return "privy";
  }, [address, exportWallet]);

  const value = useMemo<SessionValue>(() => {
    const open = (method?: LoginMethod) => {
      login({ loginMethods: method ? [method] : ["email", "google"] });
    };
    return {
      status: !ready ? "loading" : authenticated ? "authenticated" : "unauthenticated",
      user: authenticated ? sessionUser : null,
      login: async (method) => {
        open(method);
      },
      logout: async () => {
        clearClientCookie(MOCK_SESSION_COOKIE);
        clearClientCookie(MOCK_ONBOARDING_COOKIE);
        try {
          await logout();
        } finally {
          router.push("/");
          router.refresh();
        }
      },
      linkedLogins,
    };
  }, [authenticated, linkedLogins, login, logout, ready, router, sessionUser]);

  return (
    <SessionProvider value={value}>
      <PrivyTradeSigner>
        <ExportWalletProvider exportWallet={exportKey}>{children}</ExportWalletProvider>
      </PrivyTradeSigner>
    </SessionProvider>
  );
}

export function PrivyAuthProvider({ children }: { children: ReactNode }) {
  const appId = privyAppId();
  if (!appId) return <MockAuthProvider>{children}</MockAuthProvider>;

  return (
    <PrivyProvider appId={appId} config={privyConfig}>
      <PrivySession>{children}</PrivySession>
    </PrivyProvider>
  );
}
