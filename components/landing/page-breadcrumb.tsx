import Link from "next/link";

const crumbLink = "inline-flex min-h-6 items-center underline decoration-border underline-offset-4 hover:decoration-fg";

/**
 * Migas de pan de las páginas internas (T70). La última entrada es la página
 * actual y no lleva enlace. Mismo marcado que tenían /guias/[slug] y /legal.
 */
export function PageBreadcrumb({ items }: { items: readonly { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Migas" className="text-sm text-fg-muted">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="contents">
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {item.href ? (
              <Link href={item.href} className={crumbLink}>
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="min-w-0 text-fg">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
