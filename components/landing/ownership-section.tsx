import Link from "next/link";

import { Reveal } from "@/components/landing/reveal";
import { LandingSection } from "@/components/landing/section";
import { site } from "@/config/site";

/**
 * Qué tienes y qué no (T90). Dos tarjetas de distinto peso: lo que tienes es
 * la tarjeta principal (con el dibujo billetera → token); los límites van en
 * una tarjeta menor, sin restarles visibilidad. El detalle técnico de la
 * custodia sigue en /seguridad. Textos tomados de la sección de seguridad.
 */

const have = [
  "El token es tuyo y queda en la billetera de tu cuenta.",
  "Nosotros no custodiamos tus activos.",
  "Sigue el precio de la acción.",
  "Lo emite Backed (xStocks), no nosotros: la app es la interfaz para comprarlo y tenerlo.",
] as const;

const haveNot = [
  "No te convierte en accionista registrado ni te da voto.",
  "El emisor puede restringir el activo.",
  "Puedes perder lo que invertiste.",
] as const;

export function OwnershipSection() {
  return (
    <LandingSection id="propiedad" titleId="propiedad-title">
      <Reveal>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
          <h2 id="propiedad-title" className="max-w-[16ch] text-title text-balance">
            El token es tuyo. La acción, no.
          </h2>
          <p className="max-w-[28rem] text-pretty text-lead text-fg-body">
            {site.name} no es una corredora de EE.UU. Compras un token que sigue el precio de la acción y lo guardas
            en tu propia billetera.
          </p>
        </div>
      </Reveal>

      <div className="mt-10 grid gap-4 lg:grid-cols-12 lg:gap-5">
        <Reveal className="lg:col-span-7">
          <article className="flex h-full flex-col rounded-[28px] bg-surface-1 p-6 sm:p-8">
            <WalletToToken />
            <h3 className="mt-7 text-xl font-semibold tracking-tight text-fg">Lo que tienes</h3>
            <ul className="mt-4 flex flex-col gap-3">
              {have.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[15px] leading-relaxed text-fg-body">
                  <Mark kind="yes" />
                  {item}
                </li>
              ))}
            </ul>
          </article>
        </Reveal>

        <Reveal delay={80} className="lg:col-span-5">
          <article className="flex h-full flex-col rounded-[28px] border border-border bg-bg p-6 sm:p-8">
            <h3 className="text-xl font-semibold tracking-tight text-fg">Lo que no tienes</h3>
            <ul className="mt-4 flex flex-col gap-3">
              {haveNot.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[15px] leading-relaxed text-fg-body">
                  <Mark kind="no" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-auto flex flex-wrap gap-x-6 gap-y-1 pt-6">
              <Link href="/legal/riesgos" className={LINK}>
                Leer los riesgos
              </Link>
              <Link href="/seguridad" className={LINK}>
                Cómo funciona la custodia
              </Link>
            </div>
          </article>
        </Reveal>
      </div>
    </LandingSection>
  );
}

const LINK =
  "inline-flex min-h-11 items-center text-[15px] font-medium text-fg underline decoration-border-strong underline-offset-[6px] transition-colors hover:decoration-fg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-fg";

function Mark({ kind }: { kind: "yes" | "no" }) {
  return (
    <span
      aria-hidden
      className={
        kind === "yes"
          ? "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-fg text-bg"
          : "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-border-strong text-fg-muted"
      }
    >
      <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {kind === "yes" ? <path d="M2.5 6.2 5 8.6l4.5-5" /> : <path d="M3 3l6 6M9 3 3 9" />}
      </svg>
    </span>
  );
}

/** Billetera → token, monocromo. Decorativo: la lista dice lo mismo en texto. */
function WalletToToken() {
  return (
    <div aria-hidden className="flex items-center gap-3 text-fg sm:gap-5">
      <div className="flex flex-col items-center gap-2">
        <svg viewBox="0 0 72 52" className="h-12 w-auto sm:h-14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          <rect x="2" y="6" width="68" height="44" rx="11" className="fill-bg" />
          <rect x="44" y="20" width="26" height="16" rx="8" />
          <circle cx="56" cy="28" r="2" fill="currentColor" stroke="none" />
        </svg>
        <span className="text-[12px] text-fg-muted">Tu billetera</span>
      </div>
      <span className="relative h-px flex-1 overflow-hidden bg-border-strong">
        <span className="absolute inset-y-0 left-0 w-1/3 bg-fg motion-safe:animate-[token-travel_2.4s_ease-in-out_2_both]" />
      </span>
      <div className="flex flex-col items-center gap-2">
        <span className="grid size-12 place-items-center rounded-full border-[1.6px] border-fg bg-bg sm:size-14">
          <span className="size-6 rounded-full bg-fg sm:size-7" />
        </span>
        <span className="text-[12px] text-fg-muted">Token xStock</span>
      </div>
    </div>
  );
}
