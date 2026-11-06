"use client";

import { PrivyProvider, usePrivy, type PrivyClientConfig } from "@privy-io/react-auth";
import { useSignMessage, useWallets } from "@privy-io/react-auth/solana";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApiError, linkWallet, requestWalletLinkChallenge } from "@/lib/api/client";
import { useT } from "@/lib/hooks/use-t";
import { encodeBase58 } from "@/lib/solana/address";

/**
 * Vinculación de billetera con prueba de posesión.
 *
 * Con `AUTH_MODE=supabase` el proveedor de sesión de la app es Supabase y no
 * monta Privy; este componente monta su PROPIO `PrivyProvider` para que el
 * usuario inicie sesión en Privy y firme con su billetera embebida. No hay
 * atajo: si Privy no está configurado no se muestra ningún botón que vincule,
 * y si la billetera que devuelve Privy no coincide con la del desafío no se
 * firma con otra.
 *
 * La dirección NUNCA se escribe a mano: el servidor la deriva del DID
 * verificado. Aquí sólo se pide el desafío, se firma el mensaje exacto
 * (`useSignMessage`, API oficial de Privy para Solana) y se envía
 * `{ nonce, signature }`.
 */

const linkConfig: PrivyClientConfig = {
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

function LinkWalletFlow({ onLinked }: { onLinked?: () => void }) {
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

export function LinkWalletCard({ onLinked }: { onLinked?: () => void }) {
  const { t } = useT();
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? "";
  if (appId === "") {
    // Sin Privy no hay forma segura de firmar: se falla cerrado y se explica.
    return (
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{t.wallet.linkWalletTitle}</h2>
        <p className="text-sm leading-relaxed text-fg-body">{t.wallet.linkWalletNoPrivy}</p>
      </Card>
    );
  }
  return (
    <PrivyProvider appId={appId} config={linkConfig}>
      <LinkWalletFlow onLinked={onLinked} />
    </PrivyProvider>
  );
}
