import Link from "next/link";
import type { Block, Inline } from "@/lib/content/legal";

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

export function LegalBody({ blocks }: { blocks: Block[] }) {
  const headings = blocks.filter(
    (block): block is Extract<Block, { type: "h2" }> => block.type === "h2",
  );

  return (
    <div className="mt-10 space-y-4 break-words text-sm leading-relaxed text-fg-body sm:text-base">
      {headings.length >= 2 ? (
        <nav
          aria-label="Índice del documento"
          className="mb-8 rounded-2xl border border-border/80 bg-surface-1/70 p-4 sm:p-5"
        >
          <p className="text-xs font-semibold tracking-wider text-fg-muted uppercase">
            Contenido del documento ({headings.length} secciones)
          </p>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {headings.map((heading, index) => (
              <li key={heading.id}>
                <a
                  href={`#${heading.id}`}
                  className="group flex min-h-11 items-center gap-2.5 rounded-xl border border-border/60 bg-white/70 px-3 py-2 text-sm text-fg-body outline-none transition-colors hover:border-fg/25 hover:bg-surface-2 hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20"
                >
                  <span
                    aria-hidden="true"
                    className="num inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-2 text-[11px] font-semibold text-fg-muted transition-colors group-hover:bg-white group-hover:text-fg"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1">{heading.text}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      {blocks.map((block, index) => {
        if (block.type === "h2") {
          return (
            <h2 key={block.id} id={block.id} className="scroll-mt-24 pt-6 text-xl">
              {block.text}
            </h2>
          );
        }
        if (block.type === "h3") {
          return (
            <h3 key={block.id} id={block.id} className="scroll-mt-24 pt-2 text-base">
              {block.text}
            </h3>
          );
        }
        if (block.type === "ul") {
          return (
            <ul key={index} className="list-disc space-y-2 pl-5">
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
            <div key={index} className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-fg-muted">
                    {block.headers.map((cell, cellIndex) => (
                      <th key={cellIndex} scope="col" className="px-4 py-3 font-medium">
                        <Inlines items={cell} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-border last:border-b-0">
                      {row.map((cell, cellIndex) =>
                        cellIndex === 0 ? (
                          <th
                            key={cellIndex}
                            scope="row"
                            className="w-[46%] px-4 py-3 align-top font-medium text-fg md:w-2/5"
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
          );
        }
        return (
          <p key={index} className="text-pretty">
            <Inlines items={block.inlines} />
          </p>
        );
      })}
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
    <nav aria-label="Documentos legales" className="mt-12 border-t border-border pt-6">
      <h2 className="text-sm font-medium text-fg">Documentos legales</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {others.map((item) => (
          <Link
            key={item.slug}
            href={`/legal/${item.slug}`}
            className="group flex min-h-24 flex-col justify-between gap-3 rounded-2xl border border-border/80 bg-surface-1/60 p-4 outline-none transition-colors hover:border-fg/25 hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20"
          >
            <span className="text-sm font-medium text-balance text-fg">{item.label}</span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted transition-colors group-hover:text-fg">
              Leer documento →
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
