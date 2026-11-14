"use client";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";

import { DemoAddressNotice } from "@/components/domain/demo-address-notice";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { IconShare } from "@/components/ui/icons";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { QRCode } from "@/components/ui/qr-code";
import { useToast } from "@/components/ui/toast";
import { LinkWalletCard } from "@/components/wallet/link-wallet-card";
import { WalletAddress } from "@/components/wallet/wallet-address";
import { site } from "@/config/site";
import { getWallets } from "@/lib/api/client";
import { useSession } from "@/lib/auth";
import { useAccountMode } from "@/lib/hooks/use-account-mode";
import { useT } from "@/lib/hooks/use-t";
import { receivableAddress } from "@/lib/wallet/receivable-address";

function fill(template: string, values: Record<string, string>) {
  let next = template;
  for (const [key, value] of Object.entries(values)) next = next.split(`{${key}}`).join(value);
  return next;
}

const backLink =
  "inline-flex min-h-11 w-fit items-center text-sm font-medium text-fg underline decoration-fg/40 underline-offset-4 hover:decoration-fg";

export function ReceiveScreen() {
  const { t } = useT();
  const { mode } = useAccountMode();
  const session = useSession();
  const { toast } = useToast();
  // La dirección de cobro sale de `public.wallets` (fila creada al vincular con
  // prueba de posesión). La billetera de la sesión es sólo un respaldo de
  // lectura: sin fila verificada no se muestra QR ni dirección.
  const wallets = useQuery({
    queryKey: ["me", "wallets"],
    queryFn: getWallets,
    enabled: mode === "real",
  });
  const verifiedAddress = wallets.data?.primaryAddress ?? session.user?.walletAddress ?? null;
  const address = receivableAddress(mode, verifiedAddress);

  async function onShare() {
    if (!address) return;
    const text = `${fill(t.wallet.shareText, { brand: site.name })}\n${address}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: site.name, text });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(address);
      toast({ title: t.wallet.copied });
    } catch {
      toast({ title: t.wallet.shareFailed, tone: "down" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/billetera" className={backLink}>
        {t.wallet.back}
      </Link>
      <PageHeader title={t.wallet.receiveTitle} />
      {session.status === "loading" ? (
        <LoadingState label={t.states.loading} />
      ) : mode !== "real" ? (
        // Protección inmediata: la demo no muestra QR ni dirección para recibir.
        <DemoAddressNotice />
      ) : (
        <div className="flex flex-col gap-4">
          {wallets.isPending ? (
            <LoadingState label={t.states.loading} />
          ) : wallets.isError ? (
            <ErrorState
              title={t.wallet.loadError}
              label={t.states.error}
              retryLabel={t.states.retry}
              onRetry={() => {
                void wallets.refetch();
              }}
            />
          ) : (
            <Card className="flex w-full min-w-0 flex-col items-center gap-6">
              {address ? (
                <>
                  <QRCode value={address} size={176} label={t.wallet.qrLabel} />

                  <div className="flex w-full max-w-sm min-w-0 flex-col gap-3">
                    <WalletAddress
                      address={address}
                      label={t.wallet.address}
                      copyLabel={t.wallet.copy}
                      copiedLabel={t.wallet.copied}
                    />

                    <Button variant="secondary" size="md" className="w-full" onClick={() => void onShare()}>
                      <IconShare />
                      {t.wallet.share}
                    </Button>

                    <p className="text-pretty text-[13px] leading-relaxed text-fg-muted">{t.wallet.verifiedOnly}</p>
                  </div>

                  <div className="w-full max-w-md rounded-xl bg-warn-bg px-4 py-3 text-left">
                    <p className="label text-fg">{t.wallet.warnings}</p>
                    <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-[13px] leading-relaxed text-fg">
                      <li>{t.wallet.onlySolana}</li>
                      <li>{t.wallet.onlyAssets}</li>
                    </ul>
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium text-fg">{t.wallet.noWallet}</p>
                  <p className="text-sm leading-relaxed text-fg-muted">{t.wallet.noVerifiedWallet}</p>
                </div>
              )}
            </Card>
          )}
          {mode === "real" && !address && !wallets.isPending && !wallets.isError ? <LinkWalletCard /> : null}
        </div>
      )}
    </div>
  );
}
