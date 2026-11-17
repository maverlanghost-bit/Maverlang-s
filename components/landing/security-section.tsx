import Link from "next/link";
import { LandingSection, SectionHeader } from "@/components/landing/section";
import { Reveal } from "@/components/landing/reveal";
import { site } from "@/config/site";
import { REVEAL_STAGGER_MS } from "@/lib/hooks/reveal-motion";

/** Rótulo de dato a 13px: el mínimo de lectura del rediseño. */
const MICRO = "font-mono text-[13px] font-medium uppercase tracking-[0.045em] text-fg-muted";

/**
 * Lo que sí y lo que no. Cada frase sale de los textos que ya tenía la sección
 * (tarjetas «Tus activos, en tu propia billetera», «Emisor: Backed (xStocks)» y
 * «Qué no es»); no se agrega ni se suaviza ninguna advertencia.
 */
const have: string[] = [
  "El token es tuyo y queda en la billetera de tu cuenta.",
  "Nosotros no custodiamos tus activos.",
  "Quien controle la cuenta controla los activos; el modo de exportar la clave sigue en revisión.",
  "Sigue el precio de la acción.",
  "Los tokens del catálogo los emite Backed (xStocks), no nosotros: la app es la interfaz para comprarlos y tenerlos en tu billetera.",
];

const haveNot: string[] = [
  "No te convierte en accionista registrado ni te da voto.",
  "El emisor puede restringir el activo.",
  "Puedes perder lo que invertiste.",
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

function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-fg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="m8 12.4 2.8 2.8L16.2 9.6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CrossMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-fg-muted">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="m9 9 6 6m0-6-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

/** Conector horizontal (escritorio) y vertical (móvil) entre dos nodos. */
function Connector() {
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute top-full left-1/2 block h-8 w-3 -translate-x-1/2 lg:hidden"
      >
        <svg viewBox="0 0 12 32" fill="none" className="h-8 w-3 text-border-strong">
          <path d="M6 0v28m0 0-4-4m4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span
        aria-hidden="true"
        className="absolute top-1/2 left-full hidden h-3 w-12 -translate-y-1/2 lg:block"
      >
        <svg viewBox="0 0 48 12" fill="none" className="h-3 w-12 text-border-strong">
          <path d="M0 6h44m0 0-4-4m4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </>
  );
}

/**
 * Tres nodos en fila en escritorio (flechas horizontales) y en columna en
 * móvil (flechas verticales). Lista ordenada: se lee en el mismo orden con
 * lector de pantalla; los conectores son decorativos.
 */
function CustodyDiagram() {
  return (
    <figure
      aria-labelledby="seguridad-diagrama-title"
      className="rounded-bento border border-border bg-bg p-6 md:p-8"
    >
      <div className="max-w-2xl">
        <p className={MICRO}>Arquitectura de autocustodia</p>
        <h3
          id="seguridad-diagrama-title"
          className="mt-3 text-xl leading-snug font-semibold tracking-tight text-balance md:text-2xl"
        >
          La llave es tuya; la app sólo arma la transacción
        </h3>
        <p className="mt-3 text-[15px] leading-relaxed text-fg-body">
          Una orden recorre tres pasos, en este orden:
        </p>
        <p className="sr-only">
          Tres pasos en orden: Tu Billetera, Protocolo Solana / Jupiter y Token Respaldado Backed
          xStocks. La llave vive en tu billetera, la app sólo construye la transacción y el respaldo
          lo emite Backed.
        </p>
      </div>

      <ol className="mt-8 grid gap-8 lg:grid-cols-3 lg:gap-12">
        {nodes.map((node, index) => (
          <li
            key={node.name}
            className="relative rounded-xl border border-border bg-surface-1 p-5"
          >
            <span className="num text-[13px] leading-none text-fg-muted">{node.step}</span>
            <p className="mt-3 text-base leading-snug font-semibold text-fg">{node.name}</p>
            <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{node.detail}</p>
            {index < nodes.length - 1 ? <Connector /> : null}
          </li>
        ))}
      </ol>

      <figcaption className="mt-8 grid gap-x-8 gap-y-3 border-t border-border pt-5 md:grid-cols-3">
        {legend.map((item) => (
          <p key={item.term} className="text-[15px] leading-relaxed text-pretty text-fg-muted">
            <span className="font-medium text-fg">{item.term}</span> {item.text}
          </p>
        ))}
      </figcaption>
    </figure>
  );
}

const INTRO_TITLE = "Qué tienes y qué no";

/**
 * Qué tienes y qué no (T70, bloque 7): dos columnas «Tienes» / «No tienes» y,
 * debajo, el flujo de autocustodia en tres nodos.
 *
 * `showIntro={false}` lo usa /seguridad, que ya trae ese texto como titular de
 * página: el ancla de la sección se conserva para el `aria-labelledby`.
 */
export function SecuritySection({ showIntro = true }: { showIntro?: boolean }) {
  return (
    <LandingSection id="seguridad" titleId="seguridad-title" tone="muted">
      {showIntro ? (
        <Reveal>
          <SectionHeader id="seguridad-title" eyebrow="Seguridad" title={INTRO_TITLE} align="split">
            {site.name} no es una corredora de EE.UU. El token es tuyo y queda en tu billetera. Sigue el
            precio de la acción.
          </SectionHeader>
        </Reveal>
      ) : (
        <h2 id="seguridad-title" className="sr-only">
          {INTRO_TITLE}
        </h2>
      )}

      <div className={showIntro ? "mt-10 md:mt-14" : undefined}>
        <div className="grid gap-4 md:grid-cols-2 md:gap-5">
          <Reveal delay={REVEAL_STAGGER_MS} className="h-full">
            <section
              aria-labelledby="seguridad-tienes"
              className="h-full rounded-bento border border-border bg-bg p-6 md:p-8"
            >
              <p className={MICRO}>Con tu cuenta</p>
              <h3 id="seguridad-tienes" className="mt-3 text-2xl leading-tight font-semibold tracking-tight">
                Tienes
              </h3>
              <ul className="mt-6 divide-y divide-border border-t border-border">
                {have.map((item) => (
                  <li key={item} className="flex items-start gap-3 py-3.5">
                    <CheckMark />
                    <span className="text-[15px] leading-relaxed text-fg-body">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          </Reveal>

          <Reveal delay={REVEAL_STAGGER_MS * 2} className="h-full">
            <section
              aria-labelledby="seguridad-no-tienes"
              className="flex h-full flex-col rounded-bento border border-border bg-bg p-6 md:p-8"
            >
              <p className={MICRO}>Límites y riesgos</p>
              <h3
                id="seguridad-no-tienes"
                className="mt-3 text-2xl leading-tight font-semibold tracking-tight"
              >
                No tienes
              </h3>
              <ul className="mt-6 divide-y divide-border border-t border-border">
                {haveNot.map((item) => (
                  <li key={item} className="flex items-start gap-3 py-3.5">
                    <CrossMark />
                    <span className="text-[15px] leading-relaxed text-fg-body">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-auto pt-5">
                <Link
                  href="/legal/riesgos"
                  className="inline-flex min-h-11 items-center text-sm font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
                >
                  Leer los riesgos
                </Link>
              </p>
            </section>
          </Reveal>
        </div>

        <Reveal delay={REVEAL_STAGGER_MS * 3} className="mt-4 md:mt-5">
          <CustodyDiagram />
        </Reveal>
      </div>
    </LandingSection>
  );
}
