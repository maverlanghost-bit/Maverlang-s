import Link from "next/link";
import type { ReactElement } from "react";
import { SecuritySection } from "@/components/landing/security-section";
import { LandingSection } from "@/components/landing/section";
import { Card } from "@/components/ui/card";
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

const linkClass =
  "inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-fg underline decoration-border underline-offset-4 transition-colors hover:decoration-fg focus-visible:ring-4 focus-visible:ring-fg/20 motion-reduce:transition-none";

/** Página dedicada de seguridad: las tarjetas de la portada más el marco completo. */
export default function SeguridadPage() {
  return (
    <>
      <LandingSection titleId="seguridad-page-title">
        <div className="max-w-2xl">
          <p className="label">Seguridad</p>
          <h1 id="seguridad-page-title" className="mt-3 text-balance text-3xl sm:text-4xl">
            Qué tienes y qué no
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-fg-body sm:text-base">
            {site.name} no es una corredora de EE.UU. El token es tuyo y queda en tu propia
            billetera, sin custodia de nuestra parte. Sigue el precio de la acción.
          </p>
        </div>
      </LandingSection>

      <SecuritySection />

      <LandingSection titleId="seguridad-demo">
        <div className="max-w-3xl">
          <p className="label">Demo</p>
          <h2 id="seguridad-demo" className="mt-3 text-balance text-xl sm:text-2xl">
            La demo no es dinero real
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-fg-body sm:text-base">
            La demo parte con US$10.000 ficticios para practicar, con precios reales. En esta demo
            no se cobra dinero real.
          </p>
          <p className="mt-6">
            <Link
              href="/app/registro"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-fg px-5 text-sm font-medium text-bg transition-opacity hover:opacity-90 focus-visible:ring-4 focus-visible:ring-fg/20 motion-reduce:transition-none"
            >
              Probar la demo
            </Link>
          </p>
        </div>
      </LandingSection>

      <LandingSection titleId="seguridad-practicas">
        <div className="max-w-3xl">
          <p className="label">Prácticas</p>
          <h2 id="seguridad-practicas" className="mt-3 text-balance text-xl sm:text-2xl">
            Buenas prácticas
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:mt-8 sm:grid-cols-2">
            {practices.map((practice) => (
              <Card
                key={practice.title}
                className="group flex h-full flex-col gap-4 p-5 shadow-none transition-colors hover:border-border-strong hover:bg-surface-2/60 motion-reduce:transition-none sm:p-6 md:p-6"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-bg text-fg transition-colors group-hover:border-border-strong motion-reduce:transition-none">
                  <practice.Icon />
                </span>
                <div>
                  <p className="label">{practice.label}</p>
                  <h3 className="mt-2 text-base leading-relaxed">{practice.title}</h3>
                </div>
                <p className="text-sm leading-relaxed text-fg-body">{practice.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </LandingSection>

      <LandingSection titleId="seguridad-marco">
        <div className="max-w-3xl">
          <p className="label">Marco</p>
          <h2 id="seguridad-marco" className="mt-3 text-balance text-xl sm:text-2xl">
            El marco completo
          </h2>
          <ul className="mt-6 divide-y divide-border overflow-hidden rounded-3xl border border-border bg-bg sm:mt-8">
            {framework.map((item) => (
              <li
                key={item.label}
                className="flex gap-4 p-5 transition-colors hover:bg-surface-1 motion-reduce:transition-none sm:gap-5 sm:p-6"
              >
                <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface-1 text-fg">
                  <item.Icon />
                </span>
                <div className="min-w-0">
                  <p className="label">{item.label}</p>
                  <p className="mt-2 text-sm leading-relaxed text-fg-body sm:text-base">
                    <strong className="font-medium text-fg">{item.lead}</strong> {item.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
            <Link href="/legal/riesgos" className={linkClass}>
              Leer los riesgos
            </Link>
            <Link href="/ayuda" className={linkClass}>
              Ir al centro de ayuda
            </Link>
          </p>
        </div>
      </LandingSection>
    </>
  );
}
