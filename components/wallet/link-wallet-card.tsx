"use client";

import { useEffect, useState, type ComponentType } from "react";

import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { useT } from "@/lib/hooks/use-t";

/**
 * Vinculación de billetera con prueba de posesión (carga diferida).
 *
 * El SDK de Privy y el flujo de firma viven en `lib/auth/privy-provider.tsx`
 * (el único módulo autorizado a importar `@privy-io/react-auth`, igual que el
 * proveedor de sesión) y se cargan con `import()` sólo cuando esta tarjeta se
 * monta y hay app id. Así el bundle inicial no arrastra Privy.
 *
 * Sin Privy configurado no se muestra ningún botón que vincule: se falla
 * cerrado y se explica. La dirección nunca se escribe a mano; el servidor la
 * deriva del DID verificado y aquí sólo se firma el mensaje exacto del desafío.
 */
type WalletLinkFlow = ComponentType<{ onLinked?: () => void }>;

export function LinkWalletCard({ onLinked }: { onLinked?: () => void }) {
  const { t } = useT();
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? "";
  const hasPrivy = appId !== "";
  const [Flow, setFlow] = useState<WalletLinkFlow | null>(null);

  useEffect(() => {
    if (!hasPrivy) return;
    let cancelled = false;
    void import("@/lib/auth/privy-provider").then((mod) => {
      if (!cancelled) setFlow(() => mod.PrivyWalletLinkCard);
    });
    return () => {
      cancelled = true;
    };
  }, [hasPrivy]);

  if (!hasPrivy) {
    // Sin Privy no hay forma segura de firmar: se falla cerrado y se explica.
    return (
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{t.wallet.linkWalletTitle}</h2>
        <p className="text-sm leading-relaxed text-fg-body">{t.wallet.linkWalletNoPrivy}</p>
      </Card>
    );
  }

  if (!Flow) {
    return (
      <Card>
        <LoadingState label={t.states.loading} />
      </Card>
    );
  }

  return <Flow onLinked={onLinked} />;
}
