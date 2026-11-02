"use client";

import { Card } from "@/components/ui/card";
import { useT } from "@/lib/hooks/use-t";

/** Aviso fijo de demo: sin QR ni dirección para evitar envíos de fondos reales. */
export function DemoAddressNotice() {
  const { t } = useT();
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{t.wallet.demoAddressTitle}</h2>
      <p className="text-sm leading-relaxed text-fg-body">{t.wallet.demoAddressBody}</p>
      <p role="note" className="rounded-xl bg-warn-bg px-4 py-3 text-sm font-medium leading-relaxed text-fg">
        {t.wallet.demoAddressWarn}
      </p>
    </Card>
  );
}
