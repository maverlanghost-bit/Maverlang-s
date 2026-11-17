import Link from "next/link";

export type PageLinkCard = { href: string; title: string; body?: string };

/** Accesos que ya están en la navegación del sitio (404 y error). */
export const PAGE_QUICK_LINKS = [
  { href: "/acciones", title: "Acciones" },
  { href: "/como-funciona", title: "Cómo funciona" },
  { href: "/ayuda", title: "Ayuda" },
] as const;

/**
 * Fila de tarjetas-enlace con flecha (T70): cierres de página ("seguir
 * leyendo") y accesos rápidos. Cada tarjeta es un solo enlace de 44 px o más.
 * Dos tarjetas se reparten el ancho; tres o más usan tres columnas en `lg`.
 */
export function PageLinkCards({
  links,
  className = "",
}: {
  links: readonly PageLinkCard[];
  className?: string;
}) {
  const columns = links.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3";
  return (
    <ul className={`grid list-none gap-3 sm:gap-4 ${columns} ${className}`}>
      {links.map((link) => (
        <li key={link.href + link.title} className="min-w-0">
          <Link
            href={link.href}
            className="group flex h-full min-h-11 flex-col gap-2 rounded-bento border border-border bg-bg p-5 transition-colors hover:border-border-strong hover:bg-surface-1 motion-reduce:transition-none md:p-6"
          >
            <span className="flex items-start justify-between gap-4">
              <span className="min-w-0 text-lg leading-snug font-semibold tracking-tight text-fg">
                {link.title}
              </span>
              <span
                aria-hidden="true"
                className="shrink-0 text-lg leading-snug text-fg-muted transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-fg motion-reduce:transition-none"
              >
                →
              </span>
            </span>
            {link.body ? (
              <span className="text-[15px] leading-relaxed text-pretty text-fg-muted">{link.body}</span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
