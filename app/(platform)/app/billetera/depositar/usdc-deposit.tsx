"use client";

import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { LoadingState } from "@/components/ui/loading-state";
import { QRCode } from "@/components/ui/qr-code";
import { useSession } from "@/lib/auth";
import { useT } from "@/lib/hooks/use-t";

export function UsdcDeposit() {
  const { t } = useT();
  const session = useSession();
  const address = session.user?.walletAddress?.trim() ?? "";
  const steps = [t.wallet.depositUsdcStep1, t.wallet.depositUsdcStep2, t.wallet.depositUsdcStep3];

  if (session.status === "loading") return <LoadingState label={t.states.loading} />;

  return (
    <Card className="flex flex-col gap-5">
      <p>{t.wallet.depositUsdcLead}</p>
      <ol aria-label={t.wallet.depositUsdcSteps} className="flex list-decimal flex-col gap-2 pl-5">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {address ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <QRCode value={address} size={196} label={t.wallet.depositQr} />
          <p className="num max-w-full break-all text-sm text-fg">{address}</p>
          <CopyButton value={address} label={t.wallet.copy} copiedLabel={t.wallet.copied} />
        </div>
      ) : (
        <p className="text-fg-muted">{t.wallet.noWallet}</p>
      )}
      <ul aria-label={t.wallet.warnings} className="flex flex-col gap-2">
        <li className="rounded-xl bg-warn-bg px-4 py-3 font-medium leading-relaxed text-fg">{t.wallet.depositNetworkWarn}</li>
        <li className="rounded-xl bg-warn-bg px-4 py-3 font-medium leading-relaxed text-fg">{t.wallet.depositUsdcOnly}</li>
      </ul>
    </Card>
  );
}
