import type { ReactNode } from "react";
import Link from "next/link";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LiveLandingPrices } from "@/components/landing/live-landing-prices";
import { LandingSection } from "@/components/landing/section";
import { Button } from "@/components/ui/button";
import { getLandingQuotes } from "@/lib/landing/live-quotes";
import { brandShort, pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: `Cómo comprar acciones tokenizadas con USDC | ${brandShort()}`,
  description:
    "Tres pasos: elige la acción de EE.UU., revisa el precio y el desglose en dólares (US$) y recibe el token en tu propia billetera.",
  path: "/como-funciona",
  absolute: true,
});

/** Guía dedicada: los 3 pasos con más detalle que en la portada. */
export const revalidate = 30;

const RESUMEN: { label: string; num?: boolean }[] = [
  { label: "Demo US$10.000" },
  { label: "Comisión 0%" },
  { label: "24/7", num: true },
  { label: "Autocustodia" },
];

const textLinkClass =
  "inline-flex min-h-11 items-center text-sm font-medium text-fg underline decoration-border underline-offset-4 transition-colors hover:decoration-fg motion-reduce:transition-none";

function WalletIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-[18px]"
    >
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-[18px]"
    >
      <path d="M6.5 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17l-2.75-1.75L12 21l-2.75-1.75L6.5 21Z" />
      <path d="M9.25 8.25h5.5M9.25 12h5.5M9.25 15.5h3" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-[18px]"
    >
      <circle cx="8.25" cy="15.75" r="3.5" />
      <path d="M10.75 13.25 19.5 4.5" />
      <path d="M16.5 7.5 19 10" />
      <path d="M14 10l2.5 2.5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-[18px]"
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.25V12l3.25 2" />
    </svg>
  );
}

function NotaCard({
  icon,
  title,
  badge,
  mono,
  children,
}: {
  icon: ReactNode;
  title: string;
  badge: string;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col border-t border-border pt-5">
      <div className="flex items-start justify-between gap-3">
        <span
          aria-hidden="true"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl border border-border bg-bg text-fg"
        >
          {icon}
        </span>
        <span className={`text-[13px] leading-none font-medium text-fg-muted${mono ? " num" : ""}`}>
          {badge}
        </span>
      </div>
      <h3 className="mt-4 text-base leading-snug">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-fg-body">{children}</p>
    </div>
  );
}

export default async function ComoFuncionaPage() {
  const { quotes, live } = await getLandingQuotes();
  const symbols = quotes.map((quote) => quote.symbol);

  return (
    <>
      <LandingSection titleId="como-funciona-page-title" density="compact" className="pb-6 md:pb-8">
        <div className="max-w-3xl">
          <p className="label">Cómo funciona</p>
          <h1 id="como-funciona-page-title" className="mt-3 text-3xl text-balance sm:text-4xl">
            Cómo comprar acciones tokenizadas
          </h1>
          <p className="mt-4 max-w-[62ch] text-lead text-fg-body">
            Practicas con US$10.000 ficticios, eliges la acción y el token queda en tu propia
            billetera: nosotros no custodiamos tus activos. Los montos de abajo son ejemplos.
            Cuando haya cuentas reales, el depósito y su costo se muestran en ese paso.
          </p>
          <ul
            aria-label="Resumen rápido"
            className="mt-5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-sm leading-relaxed text-fg-muted"
          >
            {RESUMEN.map((item, index) => (
              <li key={item.label} className="inline-flex items-baseline gap-2.5">
                {index > 0 ? (
                  <span aria-hidden="true" className="text-fg-subtle">
                    ·
                  </span>
                ) : null}
                <span className={item.num ? "num" : "tabular-nums"}>{item.label}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button asChild>
              <Link href="/app/registro">Probar la demo</Link>
            </Button>
            <Link href="/acciones" className={textLinkClass}>
              Ver acciones
            </Link>
          </div>
        </div>
      </LandingSection>

      <LiveLandingPrices symbols={symbols} live={live} initial={quotes}>
        <HowItWorks quotes={quotes} live={live} showIntro={false} />
      </LiveLandingPrices>

      <LandingSection titleId="como-funciona-notas" density="compact">
        <div className="max-w-3xl">
          <h2 id="como-funciona-notas" className="text-2xl text-balance sm:text-3xl">
            Antes de partir
          </h2>
          <div className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-2">
            <NotaCard icon={<WalletIcon />} title="El depósito" badge="Saldo ficticio">
              La demo no pide dinero real: practicas con US$10.000 ficticios. Cuando haya cuentas
              reales, el monto, el método y el costo del proveedor se ven en ese paso.
            </NotaCard>
            <NotaCard icon={<ReceiptIcon />} title="La compra" badge="Desglose previo">
              Ves el precio en dólares (US$) y el desglose completo —comisión, red e impacto— antes
              de aceptar la orden.
            </NotaCard>
            <NotaCard icon={<KeyIcon />} title="La custodia" badge="Token en tu billetera">
              El token es tuyo y queda en tu propia billetera. Tenerlo no te hace accionista ni te
              da voto.
            </NotaCard>
            <NotaCard icon={<ClockIcon />} title="El horario" badge="24/7" mono>
              Se opera 24/7. Fuera del horario regular de la bolsa de EE.UU. el precio puede variar
              más.
            </NotaCard>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-6">
            <Link href="/costos" className={textLinkClass}>
              Ver costos
            </Link>
            <Link href="/ayuda" className={`${textLinkClass} sm:ml-auto`}>
              Ir al centro de ayuda
            </Link>
          </div>
        </div>
      </LandingSection>
    </>
  );
}
