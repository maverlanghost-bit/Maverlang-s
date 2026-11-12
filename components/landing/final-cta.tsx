import Link from "next/link";
import { Reveal } from "@/components/landing/reveal";
import { WaitlistForm } from "@/components/landing/waitlist-form";
import { Button } from "@/components/ui/button";
import { esCL } from "@/content/i18n/es-CL";
import { cn } from "@/lib/cn";

/** Rótulo de dato a 13px: el mínimo de lectura del rediseño. */
const MICRO = "font-mono text-[13px] font-medium uppercase tracking-[0.045em] text-fg-muted";

const summaryItems: string[] = [
  "US$10.000 demo instantáneos",
  "Sin tarjeta de crédito",
  "Precios en tiempo real",
];

const scheduleComparison = [
  {
    market: "Bolsa tradicional de EE.UU.",
    hours: "Lun a Vie · 09:30 a 16:00 ET",
    status: "Cierra las tardes, fines de semana y feriados",
    highlight: false,
  },
  {
    market: "Maverlang Stocks (xStocks en Solana)",
    hours: "Lunes a Domingo · 24/7 on-chain",
    status: "Opera a cualquier hora · El token queda en tu billetera",
    highlight: true,
  },
] as const;

const waitlistPerks: string[] = [
  "Acceso prioritario por orden de inscripción cuando abramos la cuenta Real.",
  "Tus acciones tokenizadas viven en tu propia billetera, nunca en custodia nuestra.",
  "Cero spam: sólo te escribiremos para avisarte del lanzamiento oficial.",
];

/**
 * Cierre de la portada en dos columnas sobre hairlines:
 * - Izquierda: manifiesto de horario ("La bolsa de EE.UU. abre de 9:30 a 16:00.
 *   El mercado on-chain sigue abierto."), comparativa de horarios con la nota de
 *   liquidez fuera de rueda y un solo CTA primario (la demo).
 * - Derecha: formulario de lista de espera para la cuenta Real
 *   (`#lista-de-espera`), como acción secundaria.
 */
export function FinalCTA() {
  return (
    <section
      aria-labelledby="cta-final-title"
      className="border-t border-border bg-surface-1 px-5 py-20 md:py-28"
    >
      <div className="mx-auto w-full max-w-7xl">
        <Reveal className="grid grid-cols-1 items-start gap-12 lg:grid-cols-12 lg:gap-16">
          {/* Columna izquierda: manifiesto 24/7, comparativa de horario y CTA. */}
          <div className="flex flex-col items-start text-left lg:col-span-7">
            <p className={MICRO}>Mercado on-chain · Operas 24/7</p>

            <h2
              id="cta-final-title"
              className="mt-4 max-w-[20ch] text-3xl leading-[1.06] tracking-tight text-balance sm:text-5xl lg:text-[52px]"
            >
              La bolsa de EE.UU. abre de 9:30 a 16:00.{" "}
              <span className="text-fg-body">El mercado on-chain sigue abierto.</span>
            </h2>

            <p className="mt-4 max-w-xl text-sm leading-relaxed text-balance text-fg-body sm:text-base">
              Cuando la bolsa de EE.UU. cierra —cada tarde, fin de semana y feriado—, el mercado on-chain
              sigue operando. Compra fracciones de acciones tokenizadas a cualquier hora, directo en tu
              billetera.
            </p>

            {/* Comparativa de horario como tabla de dos filas, sólo hairlines. */}
            <div className="mt-8 w-full max-w-xl divide-y divide-border border-y border-border">
              {scheduleComparison.map((row) => (
                <div
                  key={row.market}
                  className="grid gap-1 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-6"
                >
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-sm",
                        row.highlight ? "font-medium text-fg" : "text-fg-body",
                      )}
                    >
                      {row.market}
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{row.status}</p>
                  </div>
                  <p
                    className={cn(
                      "num text-[13px] tabular-nums sm:text-right",
                      row.highlight ? "font-medium text-fg" : "text-fg-muted",
                    )}
                  >
                    {row.hours}
                  </p>
                </div>
              ))}
              <p className="py-3 text-[13px] leading-relaxed text-fg-muted">
                Fuera del horario regular de la bolsa de EE.UU. (9:30 a 16:00, hora de Nueva York, lunes a
                viernes) hay menos liquidez y el precio puede variar más.
              </p>
            </div>

            <ul className="mt-6 flex w-full flex-wrap items-center gap-x-5 gap-y-2">
              {summaryItems.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2 text-[13px] leading-snug text-fg-muted"
                >
                  <span aria-hidden="true" className="size-1 shrink-0 rounded-full bg-border-strong" />
                  {item}
                </li>
              ))}
            </ul>

            {/* Un solo CTA primario en la vista: la demo. */}
            <div className="mt-8 flex w-full flex-col items-start gap-4 sm:w-auto sm:flex-row sm:items-center sm:gap-6">
              <Button asChild size="lg" className="min-h-11 w-full sm:w-auto">
                <Link href="/app/registro">Prueba la demo gratis</Link>
              </Button>
              <Link
                href="/app"
                className="inline-flex min-h-11 items-center text-sm font-medium text-fg underline decoration-border underline-offset-4 transition-colors hover:decoration-fg motion-reduce:transition-none"
              >
                {esCL.guest.seeStocks}
              </Link>
            </div>

            <p className="mt-4 text-[13px] leading-relaxed text-fg-muted">
              ¿Prefieres esperar la apertura con dinero real?{" "}
              <Link
                href="#lista-de-espera"
                className="font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
              >
                Avísame cuando abra la cuenta Real
              </Link>
            </p>
          </div>

          {/* Columna derecha: lista de espera como acción secundaria. */}
          <div className="w-full lg:col-span-5">
            <div
              id="lista-de-espera"
              className="scroll-mt-24 border-t border-border pt-8 text-left lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className={MICRO}>Lista de espera</p>
                <p className="text-[13px] text-fg-muted">Acceso prioritario · Cuenta Real</p>
              </div>

              <h3 className="mt-3 text-xl leading-snug tracking-tight text-fg sm:text-2xl">
                Reserva tu lugar para la cuenta Real
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-body">
                Sólo tu correo. Te escribimos apenas habilitemos tu cupo de la cuenta Real.
              </p>

              <div className="mt-6">
                <WaitlistForm source="landing" submitVariant="secondary" />
              </div>

              <ul className="mt-6 space-y-3 border-t border-border pt-5">
                {waitlistPerks.map((perk) => (
                  <li
                    key={perk}
                    className="flex items-start gap-2 text-[13px] leading-relaxed text-fg-muted"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-[0.45rem] size-1 shrink-0 rounded-full bg-border-strong"
                    />
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
