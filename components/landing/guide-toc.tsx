import { IconChevron } from "@/components/ui/icons";

export type GuideTocItem = { id: string; label: string; marker: string };

/** Fila de índice: 44 px de alto, marca mono, subrayado al pasar el cursor. */
function TocRows({ items }: { items: readonly GuideTocItem[] }) {
  return (
    <ol className="mt-2 text-sm">
      {items.map((item) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            className="flex min-h-11 items-start gap-2.5 py-1.5 leading-snug text-fg-body underline decoration-transparent underline-offset-4 transition-colors duration-150 hover:text-fg hover:decoration-fg motion-reduce:transition-none"
          >
            <span aria-hidden="true" className="mt-px font-mono text-[13px] tabular-nums text-fg-muted">
              {item.marker}
            </span>
            <span className="min-w-0">{item.label}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

/**
 * Índice de una guía (T70). En escritorio queda fijo a la izquierda del texto;
 * por debajo de `lg` se pliega en un `<details>` sobre el artículo. Se pinta
 * dos veces (uno oculto por breakpoint) porque el `<details>` no puede abrirse
 * por CSS: sólo uno queda en el árbol de accesibilidad.
 */
export function GuideToc({ items }: { items: readonly GuideTocItem[] }) {
  return (
    <aside className="mb-10 lg:sticky lg:top-24 lg:mb-0 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
      <details className="group rounded-bento border border-border bg-surface-1 px-4 lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm font-medium text-fg [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            En esta guía
            <span className="text-fg-muted"> · {items.length} apartados</span>
          </span>
          <IconChevron className="disclosure-chevron size-4 shrink-0 text-fg-muted transition-transform duration-200 motion-reduce:transition-none" />
        </summary>
        <nav aria-label="En esta guía" className="pb-3">
          <TocRows items={items} />
        </nav>
      </details>
      <nav aria-label="En esta guía" className="hidden lg:block">
        <p className="label">En esta guía</p>
        <TocRows items={items} />
      </nav>
    </aside>
  );
}
