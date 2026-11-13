"use client";

import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { PESO_DEPOSITS_ENABLED } from "@/config/onramp";
import { useT } from "@/lib/hooks/use-t";

import { PesoDeposit } from "./peso-deposit";
import { UsdcDeposit } from "./usdc-deposit";

export function DepositScreen({
  depositEligible,
}: {
  depositEligible: boolean;
}) {
  const { t } = useT();

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/app/billetera"
        className="inline-flex min-h-11 w-fit items-center text-sm font-medium text-fg underline decoration-fg/40 underline-offset-4 hover:decoration-fg"
      >
        {t.wallet.back}
      </Link>
      <PageHeader title={t.wallet.depositTitle} description={t.wallet.depositLead} />
      {/* Primera versión: sólo USDC. El depósito en pesos sigue en el código, oculto. */}
      {PESO_DEPOSITS_ENABLED ? (
        <Tabs
          label={t.wallet.depositTabs}
          defaultValue="usdc"
          tabs={[
            { value: "clp", label: t.wallet.depositPesos, content: <PesoDeposit /> },
            { value: "usdc", label: t.wallet.depositUsdc, content: <UsdcDeposit depositEligible={depositEligible} /> },
          ]}
        />
      ) : (
        <UsdcDeposit depositEligible={depositEligible} />
      )}
    </div>
  );
}
