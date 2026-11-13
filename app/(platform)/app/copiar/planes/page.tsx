import type { Metadata } from "next";
import Link from "next/link";

import { CopySoonState } from "@/components/copy/empty-states";
import { FraccionProLink } from "@/components/copy/fraccion-pro-link";
import { FraccionSeal } from "@/components/copy/fraccion-seal";
import { LegalNote } from "@/components/copy/legal-note";
import { PlansPanel } from "@/components/copy/plan-card";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { COPY_BILLING_SOON, COPY_CTA_NOTE, COPY_LEGAL_PENDING_LABEL, COPY_TERMS_DRAFT } from "@/content/copy-legal";
import { isCopyBillingEnabled, isCopyEnabled } from "@/lib/copy/flags";

/**
 * `/app/copiar/planes` (encargo §3 S9): precios, 7 días de prueba, estado de la
 * suscripción, cancelación en un clic y vinculación de Fraccion Pro.
 *
 * Los precios salen de `lib/billing/plans.ts`. Con `copy_enabled` apagado la
 * ruta muestra «Pronto», igual que el resto de la sección; con la sección
 * encendida y el cobro apagado se ven los precios con `COPY_BILLING_SOON` y
 * ningún botón puede llamar a Mercado Pago. Nada de esta página da acceso por
 * sí solo: el acceso lo confirma el webhook del proveedor.
 */

export const metadata: Metadata = {
  title: "Planes de Copiar carteras",
  description:
    "Suscripción a Copiar carteras: composición, movimientos y mezcla de compra con tecnología de Fraccion.si. 7 días de prueba y cancelación en un clic.",
};

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function PageHeader() {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Planes de Copiar carteras
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted">
            Carteras reconstruidas por Fraccion.si, con la fecha del dato y su atraso a la vista. La
            suscripción abre la composición completa, los movimientos y la mezcla de compra; cada orden la
            confirmas y la firmas tú.
          </p>
        </div>
        <Link
          href="/app/copiar"
          className={buttonClasses({ variant: "ghost", size: "md", className: "shrink-0" })}
        >
          Volver al catálogo
        </Link>
      </div>
      <FraccionSeal />
    </header>
  );
}

export default async function PlanesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;

  let enabled = false;
  let billingEnabled = false;
  try {
    enabled = await isCopyEnabled();
    if (enabled) billingEnabled = await isCopyBillingEnabled();
  } catch {
    enabled = false;
    billingEnabled = false;
  }

  if (!enabled) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader />
        <CopySoonState />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader />

      <p className="rounded-xl border border-border bg-surface-1 p-3 text-sm font-medium text-fg-body">
        {COPY_CTA_NOTE}
      </p>

      <PlansPanel
        billingEnabled={billingEnabled}
        billingSoon={COPY_BILLING_SOON}
        returned={one(query.checkout) === "retorno"}
      />

      <FraccionProLink />

      <section className="flex flex-col gap-2">
        <p className="text-sm leading-relaxed text-fg-muted">
          El cobro lo procesa Mercado Pago. Maverlang no guarda los datos de tu tarjeta y el acceso se activa
          cuando el pago queda confirmado, no al volver de la pasarela.
        </p>
        <LegalNote disclaimer />
      </section>

      <section aria-labelledby="terminos-titulo" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="terminos-titulo" className="text-base font-semibold tracking-tight">
            Términos de la suscripción
          </h2>
          <Badge tone="warn">{COPY_LEGAL_PENDING_LABEL}</Badge>
        </div>
        <p className="max-w-3xl whitespace-pre-line text-[13px] leading-relaxed text-fg-muted">
          {COPY_TERMS_DRAFT}
        </p>
      </section>
    </div>
  );
}
