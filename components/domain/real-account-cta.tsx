"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { useMe } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";

/**
 * Paso hacia la cuenta real desde una pantalla demo.
 * - Sin registro completo: lleva al onboarding.
 * - Con registro completo: "Cambiar a cuenta real" abre el mismo aviso
 *   "disponible pronto" del interruptor de cuenta (la UI real sigue apagada).
 * No promete depósitos ni operaciones reales.
 */
export function RealAccountCta({
  variant = "chip",
  className,
}: {
  variant?: "chip" | "card";
  className?: string;
}) {
  const { t, language } = useT();
  const en = language === "en";
  const router = useRouter();
  const me = useMe();
  const [soonOpen, setSoonOpen] = useState(false);

  if (me.isPending) return null;
  const done = me.data?.onboardingCompleted === true;
  const label = done
    ? t.account.switchToReal
    : variant === "card"
      ? en
        ? "Complete your sign-up"
        : "Completa tu registro"
      : en
        ? "Create real account"
        : "Crear cuenta real";
  const cardBody = done
    ? en
      ? "You are viewing the demo account."
      : "Estás viendo la cuenta demo."
    : en
      ? "Finish your details to get your real account ready."
      : "Termina tus datos para dejar lista tu cuenta real.";

  const chipClass =
    "inline-flex min-h-11 items-center rounded-full border border-border-control px-3.5 text-[13px] font-medium text-fg transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg";

  const action = done ? (
    <button type="button" onClick={() => setSoonOpen(true)} className={variant === "chip" ? cn(chipClass, className) : "w-full"}>
      {variant === "card" ? (
        <span className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-fg px-6 text-[15px] font-semibold text-bg">{label}</span>
      ) : (
        label
      )}
    </button>
  ) : variant === "chip" ? (
    <Link href="/app/onboarding" className={cn(chipClass, className)}>
      {label}
    </Link>
  ) : (
    <Button asChild size="lg" className="w-full">
      <Link href="/app/onboarding">{label}</Link>
    </Button>
  );

  return (
    <>
      {variant === "card" ? (
        <section className={cn("flex flex-col gap-3 rounded-3xl border border-border bg-surface-1 p-4", className)}>
          <p className="text-[15px] leading-5 text-fg-body">{cardBody}</p>
          {action}
        </section>
      ) : (
        action
      )}
      <Dialog open={soonOpen} onOpenChange={setSoonOpen} title={t.account.soonTitle} description={t.account.soonBody}>
        <div className="mt-6 flex sm:justify-end">
          <Button
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => {
              setSoonOpen(false);
              router.push("/app");
            }}
          >
            {t.account.soonAction}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
