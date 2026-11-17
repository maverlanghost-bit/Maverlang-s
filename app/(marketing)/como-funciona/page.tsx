import type { ReactNode } from "react";
import Link from "next/link";
import { BentoCard, BentoGrid } from "@/components/landing/bento";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LiveLandingPrices } from "@/components/landing/live-landing-prices";
import { PageHero } from "@/components/landing/page-hero";
import { PageLinkCards } from "@/components/landing/page-link-cards";
import { ProductFrame } from "@/components/landing/product-frame";
import { LandingSection, SectionHeader } from "@/components/landing/section";
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

/** Los mismos tres títulos de paso que muestra la sección de abajo. */
const PASOS = [
  { number: "01", title: "Practica con US$10.000 ficticios" },
  { number: "02", title: "Elige una acción" },
  { number: "03", title: "El token queda en tu billetera" },
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


/** Resumen de los tres pasos en un marco de ventana (decorativo: la lista real está debajo). */
function StepsSummary() {
  return (
    <ProductFrame variant="window" label="Cómo funciona" decorative>
      <ol className="divide-y divide-border">
        {PASOS.map((paso) => (
          <li key={paso.number} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
            <span className="num inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-1 text-[13px] text-fg">
              {paso.number}
            </span>
            <span className="min-w-0 text-base leading-snug font-medium text-fg">{paso.title}</span>
          </li>
        ))}
      </ol>
    </ProductFrame>
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
    <BentoCard
      as="li"
      title={title}
      className="lg:col-span-3"
      visualFirst
      visual={
        <div className="flex items-start justify-between gap-3">
          <span
            aria-hidden="true"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-bg text-fg"
          >
            {icon}
          </span>
          <span className={`text-[13px] leading-none font-medium text-fg-muted${mono ? " num" : ""}`}>
            {badge}
          </span>
        </div>
      }
    >
      {children}
    </BentoCard>
  );
}

export default async function ComoFuncionaPage() {
  const { quotes, live } = await getLandingQuotes();
  const symbols = quotes.map((quote) => quote.symbol);

  return (
    <>
      <PageHero
        titleId="como-funciona-page-title"
        eyebrow="Cómo funciona"
        title="Cómo comprar acciones tokenizadas"
        facts={RESUMEN.map((item) => (
          <span key={item.label} className={item.num ? "num" : undefined}>
            {item.label}
          </span>
        ))}
        factsLabel="Resumen rápido"
        actions={
          <>
            <Button asChild>
              <Link href="/app/registro">Probar la demo</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/acciones">Ver acciones</Link>
            </Button>
          </>
        }
        aside={<StepsSummary />}
      >
        Practicas con US$10.000 ficticios, eliges la acción y el token queda en tu propia
        billetera: nosotros no custodiamos tus activos. Los montos de abajo son ejemplos. Cuando
        haya cuentas reales, el depósito y su costo se muestran en ese paso.
      </PageHero>

      <LiveLandingPrices symbols={symbols} live={live} initial={quotes}>
        <HowItWorks quotes={quotes} live={live} showIntro={false} />
      </LiveLandingPrices>

      <LandingSection titleId="como-funciona-notas" tone="muted">
        <SectionHeader
          id="como-funciona-notas"
          align="split"
          eyebrow="Notas"
          title="Antes de partir"
        >
          El depósito, la compra, la custodia y el horario, en cuatro notas.
        </SectionHeader>
        <BentoGrid as="ul" className="mt-10 md:mt-12">
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
        </BentoGrid>
      </LandingSection>

      <LandingSection titleId="como-funciona-seguir">
        <SectionHeader id="como-funciona-seguir" title="Seguir leyendo" />
        <PageLinkCards
          className="mt-8 md:mt-10"
          links={[
            { href: "/costos", title: "Ver costos" },
            { href: "/ayuda", title: "Ir al centro de ayuda" },
          ]}
        />
      </LandingSection>
    </>
  );
}
