"use client";

import {
  PrivyProvider,
  usePrivy,
  type PrivyClientConfig,
  type User,
  type WalletWithMetadata,
} from "@privy-io/react-auth";
import { useExportWallet, useSignMessage, useWallets } from "@privy-io/react-auth/solana";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApiError, linkWallet, requestWalletLinkChallenge } from "@/lib/api/client";
import { clearClientCookie } from "@/lib/auth/browser-cookies";
import { MOCK_ONBOARDING_COOKIE, MOCK_SESSION_COOKIE } from "@/lib/auth/cookies";
import { ExportWalletProvider, type ExportWallet } from "@/lib/auth/export-wallet";
import { privyAppId } from "@/lib/auth/mode";
import { MockAuthProvider } from "@/lib/auth/mock-provider";
import { purgePrivateQueryCache } from "@/lib/auth/private-cache";
import { PrivyTradeSigner } from "@/lib/auth/privy-signer";
import { SessionProvider } from "@/lib/auth/session-context";
import type { LinkedLogin, LoginMethod, SessionUser, SessionValue } from "@/lib/auth/types";
import { useT } from "@/lib/hooks/use-t";
import { encodeBase58 } from "@/lib/solana/address";

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
  const queryClient = useQueryClient();
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
          // Se purga después del cierre de Privy: las respuestas privadas que
          // alcanzaron a completarse durante el `await` también se descartan.
          await purgePrivateQueryCache(queryClient);
          router.push("/");
          router.refresh();
        }
      },
      linkedLogins,
    };
  }, [authenticated, linkedLogins, login, logout, queryClient, ready, router, sessionUser]);

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

/**
 * Vinculación de billetera con prueba de posesión (Privy).
 *
 * Con `AUTH_MODE=supabase` el proveedor de sesión de la app es Supabase y no
 * monta Privy; la pantalla de depósito monta ESTE proveedor propio para que el
 * usuario inicie sesión en Privy y firme con su billetera embebida. No hay
 * atajo: si la billetera que devuelve Privy no coincide con la del desafío no
 * se firma con otra, y la dirección nunca se escribe a mano (el servidor la
 * deriva del DID verificado).
 *
 * Vive en este módulo, junto al resto de la integración de Privy, y se carga
 * con `import()` dinámico desde `components/wallet/link-wallet-card.tsx`: así
 * el SDK de Privy no entra al grafo estático del cliente (perf-static).
 */

const walletLinkConfig: PrivyClientConfig = {
  loginMethods: ["email", "google"],
  appearance: {
    theme: "light",
    accentColor: "#ff6a08",
    walletChainType: "solana-only",
    showWalletLoginFirst: false,
  },
  embeddedWallets: {
    solana: {
      createOnLogin: "users-without-wallets",
    },
  },
};

function PrivyWalletLinkFlow({ onLinked }: { onLinked?: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const link = useCallback(async () => {
    setError(null);
    if (!authenticated) {
      login({ loginMethods: ["email", "google"] });
      return;
    }
    setBusy(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("NO_TOKEN");
      const challenge = await requestWalletLinkChallenge(token);
      const wallet = wallets.find((item) => item.address === challenge.address);
      if (!wallet) throw new Error("WRONG_WALLET");
      const { signature } = await signMessage({
        message: new TextEncoder().encode(challenge.message),
        wallet,
        options: {
          uiOptions: {
            title: t.wallet.linkWalletSignTitle,
            description: t.wallet.linkWalletSignBody,
          },
        },
      });
      await linkWallet({ nonce: challenge.nonce, signature: encodeBase58(signature) }, token);
      setDone(true);
      await queryClient.invalidateQueries({ queryKey: ["me", "wallets"] });
      router.refresh();
      onLinked?.();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t.wallet.linkWalletError);
    } finally {
      setBusy(false);
    }
  }, [
    authenticated,
    getAccessToken,
    login,
    onLinked,
    queryClient,
    router,
    signMessage,
    t,
    wallets,
  ]);

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">{t.wallet.linkWalletTitle}</h2>
      <p className="text-sm leading-relaxed text-fg-body">{t.wallet.linkWalletBody}</p>
      {error ? (
        <p role="alert" className="rounded-xl bg-warn-bg px-4 py-3 text-sm font-medium leading-relaxed text-fg">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="rounded-xl bg-surface-2 px-4 py-3 text-sm font-medium leading-relaxed text-fg">
          {t.wallet.linkWalletDone}
        </p>
      ) : (
        <Button onClick={link} loading={busy} disabled={!ready} className="w-fit">
          {authenticated ? t.wallet.linkWalletCta : t.wallet.linkWalletConnect}
        </Button>
      )}
    </Card>
  );
}

export function PrivyWalletLinkCard({ onLinked }: { onLinked?: () => void }) {
  const appId = privyAppId();
  if (!appId) return null;
  return (
    <PrivyProvider appId={appId} config={walletLinkConfig}>
      <PrivyWalletLinkFlow onLinked={onLinked} />
    </PrivyProvider>
  );
}
