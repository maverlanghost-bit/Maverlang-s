"use client";

import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { useT } from "@/lib/hooks/use-t";

import { PesoDeposit } from "./peso-deposit";
import { UsdcDeposit } from "./usdc-deposit";

export function DepositScreen() {
  const { t } = useT();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/billetera" className="w-fit text-sm font-medium text-fg underline underline-offset-4">
        {t.wallet.back}
      </Link>
      <PageHeader title={t.wallet.depositTitle} description={t.wallet.depositLead} />
      <Tabs
        label={t.wallet.depositTabs}
        defaultValue="clp"
        tabs={[
          { value: "clp", label: t.wallet.depositPesos, content: <PesoDeposit /> },
          { value: "usdc", label: t.wallet.depositUsdc, content: <UsdcDeposit /> },
        ]}
      />
    </div>
  );
}
