"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { resetDemoAccount } from "@/lib/api/client";
import { useT } from "@/lib/hooks/use-t";
import { useToast } from "@/components/ui/toast";

/** Vuelve la cuenta demo a $1.000.000 CLP, con diálogo de confirmación. */
export function ResetDemoButton() {
  const { t } = useT();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function confirm() {
    if (pending) return;
    setPending(true);
    try {
      await resetDemoAccount();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["portfolio"] }),
        queryClient.invalidateQueries({ queryKey: ["balances"] }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
      ]);
      setOpen(false);
      toast({ title: t.account.resetDone, tone: "up" });
    } catch {
      toast({ title: t.account.resetError, tone: "down" });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" className="min-h-11" onClick={() => setOpen(true)}>
        {t.account.reset}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={t.account.resetTitle} description={t.account.resetBody}>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" size="lg" className="w-full sm:w-auto" onClick={() => setOpen(false)}>
            {t.account.resetCancel}
          </Button>
          <Button size="lg" className="w-full sm:w-auto" disabled={pending} onClick={() => void confirm()}>
            {t.account.resetConfirm}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
