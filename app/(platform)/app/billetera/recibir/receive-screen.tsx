"use client";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";

import { DemoAddressNotice } from "@/components/domain/demo-address-notice";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { QRCode } from "@/components/ui/qr-code";
import { useToast } from "@/components/ui/toast";
import { LinkWalletCard } from "@/components/wallet/link-wallet-card";
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
      <Link href="/app/billetera" className="w-fit text-sm font-medium text-fg underline underline-offset-4">
        {t.wallet.back}
      </Link>
      <PageHeader title={t.wallet.receiveTitle} description={t.wallet.receiveLead} />
      {session.status === "loading" ? (
        <LoadingState label={t.states.loading} />
      ) : mode !== "real" ? (
        // Protección inmediata: la demo no muestra QR ni dirección para recibir.
        <DemoAddressNotice />
      ) : (
        <div className="flex flex-col gap-4">
          {wallets.isPending ? (
            <LoadingState label={t.states.loading} />
          ) : (
            <Card className="flex flex-col items-center gap-5 text-center">
              {address ? (
                <>
                  <QRCode value={address} size={196} label={t.wallet.qrLabel} />
                  <p className="num max-w-full break-all text-sm text-fg">{address}</p>
                  <p className="text-sm leading-relaxed text-fg-muted">{t.wallet.verifiedOnly}</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <CopyButton value={address} label={t.wallet.copy} copiedLabel={t.wallet.copied} />
                    <Button variant="secondary" size="sm" onClick={() => void onShare()}>
                      {t.wallet.share}
                    </Button>
                  </div>
                  <ul aria-label={t.wallet.warnings} className="flex w-full flex-col gap-2 text-left">
                    <li className="rounded-xl bg-warn-bg px-4 py-3 text-sm font-medium leading-relaxed text-fg">{t.wallet.onlySolana}</li>
                    <li className="rounded-xl bg-warn-bg px-4 py-3 text-sm font-medium leading-relaxed text-fg">{t.wallet.onlyAssets}</li>
                  </ul>
                </>
              ) : (
                <>
                  <p className="text-sm text-fg-muted">{t.wallet.noWallet}</p>
                  <p className="text-sm leading-relaxed text-fg-muted">{t.wallet.noVerifiedWallet}</p>
                </>
              )}
            </Card>
          )}
          {mode === "real" && !address && !wallets.isPending ? <LinkWalletCard /> : null}
        </div>
      )}
    </div>
  );
}
