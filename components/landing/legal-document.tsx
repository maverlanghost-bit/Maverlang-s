import Link from "next/link";
import { IconChevron } from "@/components/ui/icons";
import type { Block, Inline } from "@/lib/content/legal";
import { cn } from "@/lib/cn";

const linkClass =
  "font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg";

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((item, index) => {
        if (item.type === "strong") {
          return (
            <strong key={index} className="font-medium text-fg">
              {item.value}
            </strong>
          );
        }
        if (item.type === "link") {
          if (item.href.startsWith("/")) {
            return (
              <Link key={index} href={item.href} className={linkClass}>
                {item.label}
              </Link>
            );
          }
          const external = item.href.startsWith("https:");
          return (
            <a
              key={index}
              href={item.href}
              className={linkClass}
              {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
            >
              {item.label}
            </a>
          );
        }
        return <span key={index}>{item.value}</span>;
      })}
    </>
  );
}

type Heading = Extract<Block, { type: "h2" }>;

/**
 * Índice del documento: la misma fila (44 px, número mono, subrayado al pasar)
 * que usa el índice de `/guias/[slug]`. Se pinta dos veces porque el `<details>`
 * de móvil no puede abrirse por CSS desde `lg`: uno se oculta bajo `lg` y el
 * otro desde `lg`, y sólo uno queda en el árbol de accesibilidad.
 */
function IndexLinks({ headings, className }: { headings: Heading[]; className?: string }) {
  return (
    <ol className={cn("mt-2 space-y-0.5 text-sm", className)}>
      {headings.map((heading, index) => (
        <li key={heading.id}>
          <a
            href={`#${heading.id}`}
            className="flex min-h-11 items-start gap-2.5 py-1.5 leading-snug text-fg-body underline decoration-transparent underline-offset-4 transition-colors duration-150 hover:text-fg hover:decoration-fg motion-reduce:transition-none"
          >
            <span aria-hidden="true" className="mt-px font-mono text-[13px] tabular-nums text-fg-muted">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0">{heading.text}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

export function LegalBody({ blocks }: { blocks: Block[] }) {
  const headings = blocks.filter((block): block is Heading => block.type === "h2");
  /* Con una o dos secciones el índice es más ruido que ayuda. */
  const withIndex = headings.length >= 3;

  return (
    <div className={cn("mt-8", withIndex && "lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start lg:gap-12")}>
      {withIndex ? (
        <aside className="mb-8 max-w-[68ch] lg:order-2 lg:sticky lg:top-24 lg:mb-0 lg:max-w-none">
          {/* <lg: plegado, 44 px de summary, mismo indicador que /ayuda. */}
          <details className="group border-y border-border lg:hidden">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm font-medium text-fg [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                En este documento
                <span className="text-fg-muted"> · {headings.length} secciones</span>
              </span>
              <IconChevron className="disclosure-chevron size-4 shrink-0 text-fg-muted transition-transform duration-200 motion-reduce:transition-none" />
            </summary>
            <nav aria-label="Índice del documento" className="pb-3">
              <IndexLinks headings={headings} />
            </nav>
          </details>
          {/* lg: fijo junto al texto. */}
          <nav
            aria-label="Índice del documento"
            className="hidden border-t border-border pt-4 lg:block"
          >
            <p className="eyebrow">En este documento</p>
            <IndexLinks headings={headings} />
          </nav>
        </aside>
      ) : null}

      <div className="min-w-0 max-w-[68ch] space-y-5 text-[1.0625rem] leading-7 text-fg-body">
        {blocks.map((block, index) => {
          if (block.type === "h2") {
            return (
              <h2 key={block.id} id={block.id} className="pt-6 text-[1.375rem] first:pt-0 sm:text-2xl">
                {block.text}
              </h2>
            );
          }
          if (block.type === "h3") {
            return (
              <h3 key={block.id} id={block.id} className="pt-2 text-lg">
                {block.text}
              </h3>
            );
          }
          if (block.type === "ul") {
            return (
              <ul key={index} className="list-disc space-y-2 pl-5 marker:text-fg-muted">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <Inlines items={item} />
                  </li>
                ))}
              </ul>
            );
          }
          if (block.type === "table") {
            return (
              <figure key={index} className="min-w-0 py-1">
                {/* <sm: una fila por concepto; la tabla de 544 px no cabe en 390 px. */}
                <dl className="divide-y divide-border rounded-2xl border border-border bg-bg sm:hidden">
                  {block.rows.map((row, rowIndex) => {
                    const [leading, ...rest] = row;
                    return (
                      <div key={rowIndex} className="px-4 py-4">
                        <dt className="text-[0.9375rem] leading-relaxed font-medium text-fg">
                          {leading ? <Inlines items={leading} /> : null}
                        </dt>
                        {rest.map((cell, cellIndex) => (
                          <dd key={cellIndex} className="mt-1 text-[0.9375rem] leading-relaxed text-fg-body">
                            <Inlines items={cell} />
                          </dd>
                        ))}
                      </div>
                    );
                  })}
                </dl>
                {/* ≥sm: la tabla completa, con scroll y un fundido que avisa que sigue. */}
                <div className="hidden overflow-x-auto rounded-2xl border border-border bg-bg sm:block sm:[mask-image:linear-gradient(90deg,transparent,#000_1.5%,#000_96%,transparent)]">
                  <table className="w-full min-w-[34rem] text-left text-[0.9375rem]">
                    <thead>
                      <tr className="border-b border-border">
                        {block.headers.map((cell, cellIndex) => (
                          <th
                            key={cellIndex}
                            scope="col"
                            className="px-4 py-3 text-[13px] font-medium text-fg-muted"
                          >
                            <Inlines items={cell} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {block.rows.map((row, rowIndex) => (
                        <tr
                          key={rowIndex}
                          className="border-b border-border last:border-b-0"
                        >
                          {row.map((cell, cellIndex) =>
                            cellIndex === 0 ? (
                              <th
                                key={cellIndex}
                                scope="row"
                                className="w-2/5 px-4 py-3 align-top font-medium text-fg"
                              >
                                <Inlines items={cell} />
                              </th>
                            ) : (
                              <td key={cellIndex} className="px-4 py-3 align-top text-fg-body">
                                <Inlines items={cell} />
                              </td>
                            ),
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </figure>
            );
          }
          return (
            <p key={index} className="text-pretty">
              <Inlines items={block.inlines} />
            </p>
          );
        })}
      </div>
    </div>
  );
}

const LEGAL_NAV: { slug: string; label: string }[] = [
  { slug: "terminos", label: "Términos y condiciones" },
  { slug: "privacidad", label: "Política de privacidad" },
  { slug: "riesgos", label: "Divulgación de riesgos" },
  { slug: "comisiones", label: "Comisiones" },
];

export function LegalNav({ current }: { current: string }) {
  const others = LEGAL_NAV.filter((item) => item.slug !== current);
  return (
    <nav aria-label="Documentos legales" className="mt-12 max-w-5xl border-t border-border pt-6">
      <h2 className="text-base font-medium text-fg">Documentos legales</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {others.map((item) => (
          <Link
            key={item.slug}
            href={`/legal/${item.slug}`}
            className="group flex min-h-24 flex-col justify-between gap-3 rounded-2xl border border-border p-4 transition-colors hover:border-border-strong hover:bg-surface-1"
          >
            <span className="text-sm font-medium text-balance text-fg">{item.label}</span>
            <span className="inline-flex items-center gap-1 text-[13px] font-medium text-fg-muted transition-colors group-hover:text-fg">
              Leer documento →
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
