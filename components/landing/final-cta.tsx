import Link from "next/link";
import { LandingSection } from "@/components/landing/section";
import { Reveal } from "@/components/landing/reveal";
import { WaitlistForm } from "@/components/landing/waitlist-form";
import { Button } from "@/components/ui/button";
import { esCL } from "@/content/i18n/es-CL";
import { REVEAL_STAGGER_MS } from "@/lib/hooks/reveal-motion";

/**
 * Sólo afirmaciones verdaderas en modo real y en modo demo: los precios pueden
 * ser ilustrativos, así que no se promete «tiempo real»; la moneda sí es US$.
 */
const summaryItems: string[] = [
  "US$10.000 demo instantáneos",
  "Sin tarjeta de crédito",
  "Precios en dólares (US$)",
];

const waitlistPerks: string[] = [
  "Acceso prioritario por orden de inscripción cuando abramos la cuenta Real.",
  "Tus acciones tokenizadas viven en tu propia billetera, nunca en custodia nuestra.",
  "Cero spam: sólo te escribiremos para avisarte del lanzamiento oficial.",
];

/**
 * Formulario en una fila desde `lg` (correo + botón) y la casilla de
 * consentimiento debajo. Sólo clases sobre el `<form>` de `WaitlistForm`:
 * rótulo, campo, casilla, error y botón son hijos directos.
 */
const waitlistFormRow =
  "lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-x-3 " +
  "lg:[&>label:first-child]:col-span-2 " +
  "lg:[&>input]:col-start-1 lg:[&>input]:row-start-2 " +
  "lg:[&>button]:col-start-2 lg:[&>button]:row-start-2 lg:[&>button]:mt-0 lg:[&>button]:w-auto lg:[&>button]:px-8 " +
  "lg:[&>div]:col-span-2 lg:[&>div]:row-start-3 " +
  "lg:[&>p]:col-span-2 lg:[&>p]:row-start-4";

/**
 * Cierre de la portada (T70, bloque 8): una frase, un botón primario (la demo)
 * y la lista de espera de la cuenta Real como tarjeta compacta.
 *
 * El manifiesto 24/7, la tabla de horarios y la nota de liquidez salieron de
 * aquí: viven en `HoursBand`.
 */
export function FinalCTA() {
  return (
    <LandingSection titleId="cta-final-title" tone="muted">
      <Reveal className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <p className="label">Demo gratis</p>
        <h2 id="cta-final-title" className="mt-4 text-title text-balance">
          Prueba la demo antes de usar dinero real
        </h2>
        <p className="mt-5 max-w-[52ch] text-lead text-pretty text-fg-body">
          Practica con saldo ficticio y mira cómo se compra una acción tokenizada, sin pagar nada.
        </p>

        {/* Un solo CTA primario en la vista: la demo. */}
        <div className="mt-8 flex w-full flex-col items-stretch justify-center gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/app/registro">Prueba la demo gratis</Link>
          </Button>
          <Button asChild variant="ghost" size="lg" className="w-full sm:w-auto">
            <Link href="/app">{esCL.guest.seeStocks}</Link>
          </Button>
        </div>

        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {summaryItems.map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm leading-snug text-fg-muted">
              <span aria-hidden="true" className="size-1 shrink-0 rounded-full bg-border-strong" />
              {item}
            </li>
          ))}
        </ul>
      </Reveal>

      <Reveal delay={REVEAL_STAGGER_MS} className="mx-auto mt-14 max-w-3xl md:mt-16">
        <div
          id="lista-de-espera"
          className="scroll-mt-24 rounded-bento border border-border bg-bg p-6 text-left md:p-8"
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-4">
            <p className="label">Lista de espera</p>
            <p className="text-sm text-fg-muted">Acceso prioritario · Cuenta Real</p>
          </div>

          <h3 className="mt-3 text-xl leading-snug font-semibold tracking-tight text-fg sm:text-2xl">
            Reserva tu lugar para la cuenta Real
          </h3>
          <p className="mt-2 text-[15px] leading-relaxed text-fg-body">
            Sólo tu correo. Te escribimos apenas habilitemos tu cupo de la cuenta Real.
          </p>

          <div className="mt-6">
            <WaitlistForm source="landing" submitVariant="secondary" className={waitlistFormRow} />
          </div>

          <ul className="mt-6 grid gap-3 border-t border-border pt-5 md:grid-cols-3 md:gap-6">
            {waitlistPerks.map((perk) => (
              <li
                key={perk}
                className="flex items-start gap-2 text-[13px] leading-relaxed text-fg-muted"
              >
                <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-border-strong" />
                <span>{perk}</span>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </LandingSection>
  );
}
