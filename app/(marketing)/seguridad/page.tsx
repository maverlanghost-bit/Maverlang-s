import Link from "next/link";
import type { ReactElement } from "react";
import { BentoCard, BentoGrid } from "@/components/landing/bento";
import { PageHero } from "@/components/landing/page-hero";
import { PageLinkCards } from "@/components/landing/page-link-cards";
import { SecuritySection } from "@/components/landing/security-section";
import { LandingSection, SectionHeader } from "@/components/landing/section";
import { Button } from "@/components/ui/button";
import { site } from "@/config/site";
import { brandShort, pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: `Autocustodia y seguridad | ${brandShort()}`,
  description:
    "El token queda en tu propia billetera: qué significa la autocustodia, qué derechos no incluye y qué riesgos existen al operar con acciones tokenizadas.",
  path: "/seguridad",
  absolute: true,
});

function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      <path d="M12 3 5 6.2v6.1c0 4.2 2.9 7.4 7 8.7 4.1-1.3 7-4.5 7-8.7V6.2L12 3Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      <circle cx="12" cy="12" r="8.25" />
      <path d="m8.5 12.2 2.3 2.3 4.7-5" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      <circle cx="8" cy="16" r="3.25" />
      <path d="m10.4 13.6 8.2-8.2" />
      <path d="m15.4 8.6 2 2" />
      <path d="m17.6 6.4 2 2" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  );
}

const practices: {
  label: string;
  title: string;
  body: string;
  Icon: () => ReactElement;
}[] = [
  {
    label: "01 · Acceso",
    title: "Cuida tu acceso",
    body: "Quien controle la cuenta controla los activos. No compartas tu acceso y cierra la sesión en equipos ajenos.",
    Icon: KeyIcon,
  },
  {
    label: "02 · Confirmación",
    title: "Revisa antes de confirmar",
    body: "Mira el precio en dólares (US$) y el desglose completo —comisión, red e impacto— antes de aceptar cada orden.",
    Icon: CheckIcon,
  },
  {
    label: "03 · Práctica",
    title: "Practica primero",
    body: "Usa la demo con saldo ficticio antes de operar con dinero real.",
    Icon: ClockIcon,
  },
  {
    label: "04 · Riesgo",
    title: "Lee los riesgos",
    body: "El token sigue el precio de la acción y puedes perder lo que inviertas. La divulgación completa está en borrador.",
    Icon: ShieldIcon,
  },
];

const framework: {
  label: string;
  lead: string;
  body: string;
  Icon: () => ReactElement;
}[] = [
  {
    label: "Custodia",
    lead: "Tus activos.",
    body: "El token queda en tu propia billetera. Nosotros no lo custodiamos.",
    Icon: ShieldIcon,
  },
  {
    label: "Derechos",
    lead: "Lo que no te da.",
    body: "No te convierte en accionista registrado ni te da derecho a voto.",
    Icon: CheckIcon,
  },
  {
    label: "Emisor",
    lead: "El emisor.",
    body: "Las acciones tokenizadas del catálogo las emite Backed (xStocks) y puede restringir el activo.",
    Icon: KeyIcon,
  },
  {
    label: "Riesgo",
    lead: "El riesgo.",
    body: "Puedes perder lo que inviertas. Fuera del horario regular de la bolsa de EE.UU. el precio puede variar más.",
    Icon: ClockIcon,
  },
];

/** Los mismos tres nodos de autocustodia que explica la sección de abajo. */
const FLOW: { name: string; detail: string }[] = [
  { name: "Tu billetera", detail: "La llave queda en tu cuenta. Quien controla la cuenta controla el token." },
  { name: "Solana / Jupiter", detail: "La app construye la transacción y la red la procesa." },
  { name: "Backed (xStocks)", detail: "Lo emite Backed (xStocks). Sigue el precio de la acción." },
];

/** Flujo simple de autocustodia para el hero (decorativo: el detalle está en la sección). */
function CustodyFlow() {
  return (
    <div
      aria-hidden="true"
      className="rounded-bento border border-border bg-surface-1 p-5 sm:p-6 md:p-8"
    >
      <p className="label">Autocustodia</p>
      <ol className="mt-5">
        {FLOW.map((node, index) => (
          <li key={node.name}>
            {index > 0 ? (
              <div className="flex h-7 items-center pl-[1.0625rem] text-fg-muted">
                <span className="block h-full w-px bg-border-strong" />
              </div>
            ) : null}
            <div className="flex items-start gap-4 rounded-xl border border-border bg-bg p-4">
              <span className="num inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-1 text-[13px] text-fg">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <p className="text-base leading-snug font-semibold tracking-tight text-fg">{node.name}</p>
                <p className="mt-1 text-sm leading-relaxed text-fg-muted">{node.detail}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function IconBox({ children }: { children: ReactElement }) {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-bg text-fg">
      {children}
    </span>
  );
}

/** Página dedicada de seguridad: las tarjetas de la portada más el marco completo. */
export default function SeguridadPage() {
  return (
    <>
      <PageHero
        titleId="seguridad-page-title"
        eyebrow="Seguridad"
        title="Qué tienes y qué no"
        aside={<CustodyFlow />}
      >
        {site.name} no es una corredora de EE.UU. El token es tuyo y queda en tu propia
        billetera, sin custodia de nuestra parte. Sigue el precio de la acción.
      </PageHero>

      <SecuritySection showIntro={false} />

      <LandingSection titleId="seguridad-demo" tone="muted">
        <div className="rounded-bento border border-border bg-bg p-6 md:p-10">
          <SectionHeader id="seguridad-demo" align="split" eyebrow="Demo" title="La demo no es dinero real">
            La demo parte con US$10.000 ficticios para practicar, con precios reales. En esta demo
            no se cobra dinero real.
          </SectionHeader>
          <p className="mt-8">
            <Button asChild>
              <Link href="/app/registro">Probar la demo</Link>
            </Button>
          </p>
        </div>
      </LandingSection>

      <LandingSection titleId="seguridad-practicas">
        <SectionHeader id="seguridad-practicas" align="split" eyebrow="Prácticas" title="Buenas prácticas" />
        <BentoGrid as="ul" className="mt-10 md:mt-12">
          {practices.map((practice) => (
            <BentoCard
              key={practice.title}
              as="li"
              eyebrow={practice.label}
              title={practice.title}
              visualFirst
              visual={
                <IconBox>
                  <practice.Icon />
                </IconBox>
              }
              className="lg:col-span-3"
            >
              {practice.body}
            </BentoCard>
          ))}
        </BentoGrid>
      </LandingSection>

      <LandingSection titleId="seguridad-marco" tone="muted">
        <SectionHeader id="seguridad-marco" align="split" eyebrow="Marco" title="El marco completo" />
        <BentoGrid as="ul" className="mt-10 md:mt-12">
          {framework.map((item) => (
            <BentoCard
              key={item.label}
              as="li"
              eyebrow={item.label}
              title={item.lead}
              visualFirst
              visual={
                <IconBox>
                  <item.Icon />
                </IconBox>
              }
              className="lg:col-span-3"
            >
              {item.body}
            </BentoCard>
          ))}
        </BentoGrid>
      </LandingSection>

      <LandingSection titleId="seguridad-seguir">
        <SectionHeader id="seguridad-seguir" title="Seguir leyendo" />
        <PageLinkCards
          className="mt-8 md:mt-10"
          links={[
            { href: "/legal/riesgos", title: "Leer los riesgos" },
            { href: "/ayuda", title: "Ir al centro de ayuda" },
          ]}
        />
      </LandingSection>
    </>
  );
}
