"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { QRCode } from "@/components/ui/qr-code";
import { useToast } from "@/components/ui/toast";
import { site } from "@/config/site";
import { useSession } from "@/lib/auth";
import { useT } from "@/lib/hooks/use-t";

function fill(template: string, values: Record<string, string>) {
  let next = template;
  for (const [key, value] of Object.entries(values)) next = next.split(`{${key}}`).join(value);
  return next;
}

export function ReceiveScreen() {
  const { t } = useT();
  const session = useSession();
  const { toast } = useToast();
  const address = session.user?.walletAddress?.trim() ?? "";

  async function onShare() {
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
      ) : (
        <Card className="flex flex-col items-center gap-5 text-center">
          {address ? (
            <>
              <QRCode value={address} size={196} label={t.wallet.qrLabel} />
              <p className="num max-w-full break-all text-sm text-fg">{address}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <CopyButton value={address} label={t.wallet.copy} copiedLabel={t.wallet.copied} />
                <Button variant="secondary" size="sm" onClick={() => void onShare()}>
                  {t.wallet.share}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-fg-muted">{t.wallet.noWallet}</p>
          )}
          <ul aria-label={t.wallet.warnings} className="flex w-full flex-col gap-2 text-left">
            <li className="rounded-xl bg-warn-bg px-4 py-3 text-sm font-medium leading-relaxed text-fg">{t.wallet.onlySolana}</li>
            <li className="rounded-xl bg-warn-bg px-4 py-3 text-sm font-medium leading-relaxed text-fg">{t.wallet.onlyAssets}</li>
          </ul>
        </Card>
      )}
    </div>
  );
}
