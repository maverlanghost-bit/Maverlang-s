import type { ReactNode } from "react";
import Link from "next/link";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LiveLandingPrices } from "@/components/landing/live-landing-prices";
import { LandingSection } from "@/components/landing/section";
import { Card } from "@/components/ui/card";
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

const ENLACES = [
  { href: "/acciones", label: "Ver acciones" },
  { href: "/costos", label: "Ver costos" },
  { href: "/ayuda", label: "Ir al centro de ayuda" },
] as const;

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
    <Card className="group flex h-full flex-col rounded-3xl border-border/80 p-5 shadow-none transition-colors duration-200 hover:border-border-strong hover:bg-surface-2/50 motion-reduce:transition-none sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <span
          aria-hidden="true"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface-2 text-fg transition-colors duration-200 group-hover:border-border-strong motion-reduce:transition-none"
        >
          {icon}
        </span>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-bg px-2.5 py-1 text-[11px] leading-none font-medium text-fg-muted${
            mono ? " num" : ""
          }`}
        >
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-fg-muted" />
          {badge}
        </span>
      </div>
      <h3 className="mt-5 text-base">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-fg-body">{children}</p>
    </Card>
  );
}

export default async function ComoFuncionaPage() {
  const { quotes, live } = await getLandingQuotes();
  const symbols = quotes.map((quote) => quote.symbol);

  return (
    <>
      <LandingSection titleId="como-funciona-title">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="label">Cómo funciona</p>
            <span aria-hidden="true" className="hidden h-3 w-px bg-border sm:block" />
            <ul aria-label="Resumen rápido" className="flex flex-wrap items-center gap-2">
              {RESUMEN.map((item) => (
                <li
                  key={item.label}
                  className={`inline-flex items-center rounded-full border border-border bg-bg px-2.5 py-1 text-[11px] leading-none font-medium text-fg-body sm:text-xs${
                    item.num ? " num" : " tabular-nums"
                  }`}
                >
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
          <h1
            id="como-funciona-title"
            className="mt-5 text-4xl tracking-tight text-balance sm:text-5xl"
          >
            Tres pasos, en dólares (US$)
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-fg-body sm:text-base">
            Practicas con US$10.000 ficticios, eliges la acción y el token queda en tu propia
            billetera: nosotros no custodiamos tus activos. Los montos de abajo son ejemplos.
            Cuando haya cuentas reales, el depósito y su costo se muestran en ese paso.
          </p>
        </div>
      </LandingSection>
      <LiveLandingPrices symbols={symbols} live={live} initial={quotes}>
        <HowItWorks quotes={quotes} live={live} />
      </LiveLandingPrices>
      <LandingSection titleId="como-funciona-notas">
        <div className="max-w-3xl">
          <h2 id="como-funciona-notas" className="text-2xl text-balance sm:text-3xl">
            Antes de partir
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 md:gap-5">
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
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border pt-2">
            {ENLACES.map((enlace) => (
              <Link
                key={enlace.href}
                href={enlace.href}
                className="group inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-fg underline decoration-border underline-offset-4 transition-colors hover:decoration-fg"
              >
                {enlace.label}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-fg-muted transition-transform duration-150 group-hover:text-fg motion-safe:group-hover:translate-x-0.5 motion-reduce:transition-none"
                >
                  <path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      </LandingSection>
    </>
  );
}
