import { Fragment } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { LandingSection, SectionIntro } from "@/components/landing/section";
import { Reveal } from "@/components/landing/reveal";
import { Card } from "@/components/ui/card";
import { site } from "@/config/site";
import { REVEAL_STAGGER_MS } from "@/lib/hooks/reveal-motion";

/**
 * Íconos de encabezado: trazo arquitectónico, sin relleno, heredan el color
 * del texto. Son decorativos: la etiqueta de categoría es el texto real.
 */
function IconKey() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="3.2" />
      <path d="M10.4 10.4 19 19" />
      <path d="M16.2 16.2 14 18.4" />
      <path d="M18.2 18.2 16.6 19.8" />
    </svg>
  );
}

function IconIssuer() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <path d="M5 3.5h9.5a1 1 0 0 1 1 1v16H6a1 1 0 0 1-1-1z" />
      <path d="M6 7h7" />
      <path d="M6 10.5h7" />
      <circle cx="9.5" cy="16.4" r="2.5" />
      <path d="M8.4 16.5 9.2 17.3 10.7 15.7" />
    </svg>
  );
}

function IconLedger() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M9.5 9.5v10" />
      <path d="M15 9.5v10" />
    </svg>
  );
}

const points: {
  title: string;
  body: string;
  category: string;
  icon: ReactNode;
  extra?: "risks";
}[] = [
  {
    title: "Tus activos, en tu propia billetera",
    body: "El token es tuyo y queda en la billetera de tu cuenta: nosotros no custodiamos tus activos. Quien controle la cuenta controla los activos; el modo de exportar la clave sigue en revisión.",
    category: "LLAVE PROPIA",
    icon: <IconKey />,
  },
  {
    title: "Emisor: Backed (xStocks)",
    body: "Los tokens del catálogo los emite Backed (xStocks), no nosotros: la app es la interfaz para comprarlos y tenerlos en tu billetera. El emisor puede restringir el activo.",
    category: "EMISOR REGULADO",
    icon: <IconIssuer />,
  },
  {
    title: "Qué no es",
    body: "El token es tuyo, en tu billetera, y sigue el precio de la acción. No te convierte en accionista registrado ni te da voto. El emisor puede restringir el activo. Puedes perder lo que invertiste.",
    category: "TRANSPARENCIA",
    icon: <IconLedger />,
    extra: "risks",
  },
];

const nodes: { step: string; name: string; detail: string }[] = [
  {
    step: "01",
    name: "Tu Billetera",
    detail: "La llave queda en tu cuenta. Quien controla la cuenta controla el token.",
  },
  {
    step: "02",
    name: "Protocolo Solana / Jupiter",
    detail: "La app construye la transacción y la red la procesa.",
  },
  {
    step: "03",
    name: "Token Respaldado Backed xStocks",
    detail: "Lo emite Backed (xStocks). Sigue el precio de la acción.",
  },
];

const legend: { term: string; text: string }[] = [
  {
    term: "Tu llave",
    text: "vive en tu billetera: quien controla la cuenta controla el token.",
  },
  {
    term: "La app",
    text: "sólo construye la transacción; no custodiamos tus activos.",
  },
  {
    term: "El respaldo",
    text: "lo emite Backed (xStocks): no te convierte en accionista registrado.",
  },
];

/** Conector del diagrama: vertical en móvil, horizontal desde md. */
function Connector() {
  return (
    <div
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center py-1 md:w-11 md:py-0"
    >
      <svg
        viewBox="0 0 12 40"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-8 w-3 text-fg-muted md:hidden"
        aria-hidden="true"
      >
        <path d="M6 1.5v27" />
        <path d="M2 30 6 34l4-4" />
      </svg>
      <svg
        viewBox="0 0 44 12"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="hidden h-3 w-11 text-fg-muted md:block"
        aria-hidden="true"
      >
        <path d="M1.5 6h31" />
        <path d="M30 2.5 34 6l-4 3.5" />
      </svg>
    </div>
  );
}

function CustodyDiagram() {
  return (
    <figure
      aria-labelledby="seguridad-diagrama-title"
      className="rounded-3xl border border-border bg-surface-1 p-5 md:p-8"
    >
      <p className="label">Arquitectura de autocustodia</p>
      <h3 id="seguridad-diagrama-title" className="mt-2 text-base leading-relaxed md:text-lg">
        La llave es tuya; la app sólo arma la transacción
      </h3>
      <p className="sr-only">
        Tres nodos en orden: Tu Billetera, Protocolo Solana / Jupiter y Token Respaldado
        Backed xStocks. La llave vive en tu billetera, la app sólo construye la transacción y
        el respaldo lo emite Backed.
      </p>
      <div className="mt-6 flex flex-col md:flex-row md:items-stretch">
        {nodes.map((node, index) => (
          <Fragment key={node.name}>
            {index > 0 ? <Connector /> : null}
            <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-bg p-4 md:flex-1 md:p-5">
              <span className="label">Nodo {node.step}</span>
              <p className="text-sm font-medium leading-snug text-fg">{node.name}</p>
              <p className="text-xs leading-relaxed text-fg-muted">{node.detail}</p>
            </div>
          </Fragment>
        ))}
      </div>
      <figcaption className="mt-6 border-t border-border pt-4 text-xs leading-relaxed text-fg-muted">
        {legend.map((item, index) => (
          <span key={item.term}>
            {index > 0 ? <span aria-hidden="true"> · </span> : null}
            <span className="font-medium text-fg-body">{item.term}</span> {item.text}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

const INTRO_TITLE = "Qué tienes y qué no";

/**
 * `showIntro={false}` lo usa /seguridad, que ya trae ese texto como titular de
 * página: el ancla de la sección se conserva para el `aria-labelledby`.
 */
export function SecuritySection({ showIntro = true }: { showIntro?: boolean }) {
  return (
    <LandingSection id="seguridad" titleId="seguridad-title">
      {showIntro ? (
        <Reveal>
          <SectionIntro id="seguridad-title" title={INTRO_TITLE}>
            {site.name} no es una corredora de EE.UU. El token es tuyo y queda en tu billetera. Sigue el precio de la acción.
          </SectionIntro>
        </Reveal>
      ) : (
        <h2 id="seguridad-title" className="sr-only">
          {INTRO_TITLE}
        </h2>
      )}
      <div className="mt-10 grid gap-4 md:mt-14 md:grid-cols-3">
        {points.map((point, index) => (
          <Reveal key={point.title} delay={(index + 1) * REVEAL_STAGGER_MS} className="h-full">
            <Card className="flex h-full flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-bg text-fg">
                  {point.icon}
                </span>
                <span className="label">{point.category}</span>
              </div>
              <h3 className="text-base leading-relaxed">{point.title}</h3>
              <p className="text-sm leading-relaxed text-fg-body">{point.body}</p>
              {point.extra === "risks" ? (
                <p className="mt-auto">
                  <Link
                    href="/legal/riesgos"
                    className="inline-flex min-h-11 items-center text-sm font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
                  >
                    Leer los riesgos
                  </Link>
                </p>
              ) : null}
            </Card>
          </Reveal>
        ))}
      </div>
      <Reveal delay={REVEAL_STAGGER_MS * 4} className="mt-10 md:mt-12">
        <CustodyDiagram />
      </Reveal>
    </LandingSection>
  );
}
