import Link from "next/link";
import { LandingSection, SectionIntro } from "@/components/landing/section";
import { Reveal } from "@/components/landing/reveal";
import { site } from "@/config/site";
import { REVEAL_STAGGER_MS } from "@/lib/hooks/reveal-motion";

/** Rótulo de dato a 13px: el mínimo de lectura del rediseño. */
const MICRO = "font-mono text-[13px] font-medium uppercase tracking-[0.045em] text-fg-muted";

const points: {
  title: string;
  body: string;
  category: string;
  extra?: "risks";
}[] = [
  {
    title: "Tus activos, en tu propia billetera",
    body: "El token es tuyo y queda en la billetera de tu cuenta: nosotros no custodiamos tus activos. Quien controle la cuenta controla los activos; el modo de exportar la clave sigue en revisión.",
    category: "LLAVE PROPIA",
  },
  {
    title: "Emisor: Backed (xStocks)",
    body: "Los tokens del catálogo los emite Backed (xStocks), no nosotros: la app es la interfaz para comprarlos y tenerlos en tu billetera. El emisor puede restringir el activo.",
    category: "EMISOR REGULADO",
  },
  {
    title: "Qué no es",
    body: "El token es tuyo, en tu billetera, y sigue el precio de la acción. No te convierte en accionista registrado ni te da voto. El emisor puede restringir el activo. Puedes perder lo que invertiste.",
    category: "TRANSPARENCIA",
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

/**
 * El diagrama se lee como una explicación: tres pasos numerados en una lista
 * ordenada, con hairlines. Sin flechas ni cajas decorativas.
 */
function CustodyDiagram() {
  return (
    <figure aria-labelledby="seguridad-diagrama-title" className="border-t border-border pt-8 md:pt-10">
      <div className="grid gap-8 md:grid-cols-12 md:gap-12">
        <div className="md:col-span-4">
          <p className={MICRO}>Arquitectura de autocustodia</p>
          <h3
            id="seguridad-diagrama-title"
            className="mt-3 text-xl leading-snug tracking-tight md:text-2xl"
          >
            La llave es tuya; la app sólo arma la transacción
          </h3>
          <p className="mt-3 max-w-[36ch] text-[13px] leading-relaxed text-fg-body">
            Una orden recorre tres pasos, en este orden:
          </p>
          <p className="sr-only">
            Tres pasos en orden: Tu Billetera, Protocolo Solana / Jupiter y Token Respaldado
            Backed xStocks. La llave vive en tu billetera, la app sólo construye la transacción y
            el respaldo lo emite Backed.
          </p>
        </div>

        <ol className="border-t border-border md:col-span-8">
          {nodes.map((node) => (
            <li
              key={node.name}
              className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-4 border-b border-border py-4 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-6 sm:py-5"
            >
              <span className="num pt-0.5 text-[13px] leading-none text-fg-muted">{node.step}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-snug text-fg sm:text-base">{node.name}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-fg-muted sm:text-sm">
                  {node.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <figcaption className="mt-6 grid gap-x-8 gap-y-3 border-t border-border pt-5 md:grid-cols-3">
        {legend.map((item) => (
          <p key={item.term} className="text-[13px] leading-relaxed text-pretty text-fg-muted">
            <span className="font-medium text-fg">{item.term}</span> {item.text}
          </p>
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
      <ul className="mt-10 grid border-y border-border md:mt-14 md:grid-cols-3">
        {points.map((point, index) => (
          <li
            key={point.title}
            className="border-b border-border py-6 last:border-b-0 md:border-b-0 md:border-r md:px-8 md:py-8 md:first:pl-0 md:last:border-r-0 md:last:pr-0"
          >
            <Reveal delay={(index + 1) * REVEAL_STAGGER_MS} className="flex h-full flex-col">
              <p className={MICRO}>
                {String(index + 1).padStart(2, "0")} · {point.category}
              </p>
              <h3 className="mt-4 text-lg leading-snug text-fg">{point.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-pretty text-fg-body">{point.body}</p>
              {point.extra === "risks" ? (
                <p className="mt-auto pt-4">
                  <Link
                    href="/legal/riesgos"
                    className="inline-flex min-h-11 items-center text-sm font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
                  >
                    Leer los riesgos
                  </Link>
                </p>
              ) : null}
            </Reveal>
          </li>
        ))}
      </ul>
      <Reveal delay={REVEAL_STAGGER_MS * 4} className="mt-10 md:mt-12">
        <CustodyDiagram />
      </Reveal>
    </LandingSection>
  );
}
