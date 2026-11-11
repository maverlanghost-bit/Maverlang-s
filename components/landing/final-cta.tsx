import type { ComponentType, SVGProps } from "react";
import Link from "next/link";
import { BrandMarkImage } from "@/components/app-shell/brand-image";
import { Reveal } from "@/components/landing/reveal";
import { WaitlistForm } from "@/components/landing/waitlist-form";
import { Button } from "@/components/ui/button";
import { IconChart, IconCheck, IconClock, IconWallet } from "@/components/ui/icons";
import { esCL } from "@/content/i18n/es-CL";

const summaryPills: { label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { label: "US$10.000 demo instantáneos", Icon: IconClock },
  { label: "Sin tarjeta de crédito", Icon: IconCheck },
  { label: "Precios en tiempo real", Icon: IconChart },
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

const waitlistPerks: { text: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  {
    text: "Acceso prioritario por orden de inscripción cuando abramos la cuenta Real.",
    Icon: IconClock,
  },
  {
    text: "Tus acciones tokenizadas viven en tu propia billetera, nunca en custodia nuestra.",
    Icon: IconWallet,
  },
  {
    text: "Cero spam: sólo te escribiremos para avisarte del lanzamiento oficial.",
    Icon: IconCheck,
  },
];

/**
 * Cierre de la portada en formato split-screen:
 * - Izquierda: manifiesto de horario ("La bolsa de EE.UU. abre de 9:30 a 16:00.
 *   El mercado on-chain sigue abierto."), comparativa de horarios con la nota de
 *   liquidez fuera de rueda y CTAs de la cuenta demo.
 * - Derecha: tarjeta ejecutiva independiente con el formulario de lista de espera
 *   para la cuenta Real (`#lista-de-espera`).
 */
export function FinalCTA() {
  return (
    <section
      aria-labelledby="cta-final-title"
      className="relative isolate overflow-hidden bg-surface-1 px-5 py-20 md:py-28 lg:py-32"
    >
      {/* Halo decorativo: esmeralda tenue a la derecha y grafito suave abajo. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[image:radial-gradient(60%_55%_at_80%_20%,rgba(15,122,50,0.10),transparent_72%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[image:radial-gradient(65%_50%_at_20%_100%,rgba(10,10,10,0.05),transparent_75%)]"
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-border" />

      <div className="relative mx-auto w-full max-w-6xl">
        <Reveal className="grid grid-cols-1 items-start gap-12 lg:grid-cols-12 lg:items-center lg:gap-12">
          {/* Columna izquierda: Manifiesto 24/7 + comparativa de horario + CTAs Demo */}
          <div className="flex flex-col items-start text-left lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-up/25 bg-up-bg px-3 py-1 text-xs font-medium text-up">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-up motion-safe:animate-pulse motion-reduce:animate-none"
              />
              <span>Mercado on-chain · Operas 24/7</span>
            </div>

            <h2
              id="cta-final-title"
              className="mt-5 text-3xl leading-[1.06] tracking-tight text-balance sm:text-5xl lg:text-[52px]"
            >
              La bolsa de EE.UU. abre de 9:30 a 16:00.{" "}
              <span className="text-fg-body">El mercado on-chain sigue abierto.</span>
            </h2>

            <p className="mt-4 max-w-xl text-sm leading-relaxed text-balance text-fg-body sm:text-base">
              Cuando la bolsa de EE.UU. cierra —cada tarde, fin de semana y feriado—, el mercado on-chain
              sigue operando. Compra fracciones de acciones tokenizadas a cualquier hora, directo en tu
              billetera.
            </p>

            {/* Comparativa visual de horario: Wall Street vs Maverlang 24/7 */}
            <div className="mt-7 w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-bg/90 shadow-xs">
              <div className="divide-y divide-border">
                {scheduleComparison.map((row) => (
                  <div
                    key={row.market}
                    className={
                      row.highlight
                        ? "flex flex-col gap-1 bg-up-bg/40 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5"
                        : "flex flex-col gap-1 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5"
                    }
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-fg sm:text-sm">{row.market}</p>
                      <p className="mt-0.5 text-xs text-fg-muted">{row.status}</p>
                    </div>
                    <span
                      className={
                        row.highlight
                          ? "num inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-up/25 bg-bg px-2.5 py-1 text-xs font-semibold text-up sm:self-center"
                          : "num inline-flex shrink-0 items-center self-start rounded-full border border-border bg-surface-1 px-2.5 py-1 text-xs font-medium text-fg-muted sm:self-center"
                      }
                    >
                      {row.highlight ? (
                        <span aria-hidden="true" className="size-1.5 rounded-full bg-up" />
                      ) : null}
                      {row.hours}
                    </span>
                  </div>
                ))}
              </div>
              <p className="border-t border-border/70 bg-surface-1/50 px-4 py-2.5 text-xs leading-relaxed text-fg-muted sm:px-5">
                Fuera del horario regular de la bolsa de EE.UU. (9:30 a 16:00, hora de Nueva York, lunes a
                viernes) hay menos liquidez y el precio puede variar más.
              </p>
            </div>

            <ul className="mt-6 flex w-full flex-wrap items-center gap-2">
              {summaryPills.map((pill) => (
                <li
                  key={pill.label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-3 py-1.5 text-xs leading-snug text-fg-body sm:text-sm"
                >
                  <pill.Icon className="size-3.5 shrink-0 text-fg-muted" />
                  {pill.label}
                </li>
              ))}
            </ul>

            <div className="mt-7 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
              <Button asChild size="lg" className="min-h-11 w-full sm:w-auto">
                <Link href="/app/registro">Prueba la demo gratis</Link>
              </Button>
              <Button asChild variant="secondary" size="lg" className="min-h-11 w-full sm:w-auto">
                <Link href="/app">{esCL.guest.seeStocks}</Link>
              </Button>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-fg-muted sm:text-sm">
              ¿Prefieres esperar la apertura con dinero real?{" "}
              <Link
                href="#lista-de-espera"
                className="font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
              >
                Avísame cuando abra la cuenta Real
              </Link>
            </p>
          </div>

          {/* Columna derecha: Tarjeta ejecutiva de Lista de Espera */}
          <div className="w-full lg:col-span-5">
            <div
              id="lista-de-espera"
              className="scroll-mt-24 rounded-3xl border border-border bg-bg p-6 text-left shadow-float sm:p-8"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center justify-center rounded-2xl border border-border bg-surface-1 p-2">
                  <BrandMarkImage className="size-7" />
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-1 px-3 py-1 text-xs font-medium text-fg-body">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-fg" />
                  Acceso prioritario · Cuenta Real
                </span>
              </div>

              <p className="label mt-5">Lista de espera</p>
              <h3 className="mt-1.5 text-2xl font-semibold tracking-tight text-fg sm:text-[26px]">
                Reserva tu lugar para la cuenta Real
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-body">
                Sólo tu correo. Te escribimos apenas habilitemos tu cupo de la cuenta Real.
              </p>

              <div className="mt-6 rounded-2xl border border-border/80 bg-surface-1/60 p-4 sm:p-5">
                <WaitlistForm source="landing" submitVariant="secondary" />
              </div>

              <ul className="mt-5 space-y-2.5 border-t border-border/70 pt-5">
                {waitlistPerks.map((perk) => (
                  <li key={perk.text} className="flex items-start gap-2.5 text-xs leading-relaxed text-fg-muted">
                    <perk.Icon className="mt-0.5 size-3.5 shrink-0 text-fg-body" />
                    <span>{perk.text}</span>
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
