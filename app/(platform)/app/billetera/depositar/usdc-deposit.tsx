"use client";

import { useQuery } from "@tanstack/react-query";

import { DemoAddressNotice } from "@/components/domain/demo-address-notice";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { LoadingState } from "@/components/ui/loading-state";
import { QRCode } from "@/components/ui/qr-code";
import { LinkWalletCard } from "@/components/wallet/link-wallet-card";
import { getWallets } from "@/lib/api/client";
import { useSession } from "@/lib/auth";
import { useAccountMode } from "@/lib/hooks/use-account-mode";
import { useT } from "@/lib/hooks/use-t";
import { receivableAddress } from "@/lib/wallet/receivable-address";

export function UsdcDeposit({ depositEligible }: { depositEligible: boolean }) {
  const { t } = useT();
  const { mode } = useAccountMode();
  const session = useSession();
  // La dirección de depósito sale de `public.wallets` (servidor), no de la
  // billetera que muestra el proveedor de sesión: sólo una fila creada por la
  // vinculación con prueba de posesión puede mostrarse como dirección de
  // cobro. Antes de vincular no hay fila y no hay QR.
  const wallets = useQuery({
    queryKey: ["me", "wallets"],
    queryFn: getWallets,
    enabled: mode === "real" && depositEligible,
    staleTime: 0,
  });
  const address = receivableAddress(mode, wallets.data?.primaryAddress ?? null);
  const steps = [t.wallet.depositUsdcStep1, t.wallet.depositUsdcStep2, t.wallet.depositUsdcStep3];

  if (session.status === "loading") return <LoadingState label={t.states.loading} />;

  // Protección inmediata: la demo no muestra QR ni dirección, para que nadie
  // envíe fondos reales a la billetera ficticia.
  if (mode !== "real") return <DemoAddressNotice />;

  // Identidad: la decisión la toma el servidor (correo verificado en Supabase
  // Auth, sin lista de correos). Sin elegibilidad no se muestra dirección ni
  // QR: el barrido tampoco acreditaría nada a esta cuenta.
  if (!depositEligible) {
    return (
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{t.wallet.depositVerifyTitle}</h2>
        <p className="text-sm leading-relaxed text-fg-body">{t.wallet.depositVerifyBody}</p>
        <p role="note" className="rounded-xl bg-warn-bg px-4 py-3 text-sm font-medium leading-relaxed text-fg">
          {t.wallet.depositVerifyWarn}
        </p>
      </Card>
    );
  }

  if (wallets.isPending) return <LoadingState label={t.states.loading} />;

  if (!address) {
    // Sin billetera vinculada y verificada no hay dirección ni QR: se ofrece
    // el flujo real (desafío + firma con Privy). No hay alternativa "confiar
    // en la primera vez".
    return <LinkWalletCard />;
  }

  return (
    <Card className="flex flex-col gap-5">
      <p>{t.wallet.depositUsdcLead}</p>
      <ol aria-label={t.wallet.depositUsdcSteps} className="flex list-decimal flex-col gap-2 pl-5">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div className="flex flex-col items-center gap-4 text-center">
        <QRCode value={address} size={196} label={t.wallet.depositQr} />
        <p className="num max-w-full break-all text-sm text-fg">{address}</p>
        <p className="text-sm leading-relaxed text-fg-muted">{t.wallet.verifiedOnly}</p>
        <CopyButton value={address} label={t.wallet.copy} copiedLabel={t.wallet.copied} />
      </div>
      <ul aria-label={t.wallet.warnings} className="flex flex-col gap-2">
        <li className="rounded-xl bg-warn-bg px-4 py-3 font-medium leading-relaxed text-fg">{t.wallet.depositNetworkWarn}</li>
        <li className="rounded-xl bg-warn-bg px-4 py-3 font-medium leading-relaxed text-fg">{t.wallet.depositUsdcOnly}</li>
      </ul>
    </Card>
  );
}
