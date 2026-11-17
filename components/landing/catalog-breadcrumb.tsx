import Link from "next/link";

/**
 * Migas de las páginas públicas del catálogo (T70). El último elemento no lleva
 * `href`: es la página actual. Cada enlace mide 44 px de alto táctil sin
 * agrandar el texto.
 */
export function CatalogBreadcrumb({
  items,
}: {
  items: readonly { name: string; href?: string }[];
}) {
  return (
    <nav aria-label="Migas" className="text-[13px] text-fg-muted">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-0">
        {items.map((item, index) => (
          <li key={`${item.name}-${index}`} className="inline-flex items-center gap-x-2">
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {item.href ? (
              <Link
                href={item.href}
                className="inline-flex min-h-11 items-center underline decoration-border underline-offset-4 transition-colors hover:text-fg hover:decoration-fg motion-reduce:transition-none"
              >
                {item.name}
              </Link>
            ) : (
              <span aria-current="page" className="inline-flex min-h-11 items-center text-fg">
                {item.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
