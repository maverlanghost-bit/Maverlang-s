import Link from "next/link";

/**
 * Copy en uso: "Comisión 0% en el lanzamiento • Ver costos" → /#costos
 * La versión anterior ("Opera 24/7 • Cómo funciona") repetía el destino del
 * enlace de texto del hero; el anuncio ahora lleva a la sección de costos.
 *
 * ALTERNATIVA: "Opera 24/7 • Cómo funciona"
 * ALTERNATIVA: "En tu propia billetera • Cómo funciona"
 */
export function AnnouncementPill() {
  return (
    <Link
      href="/#costos"
      className="mx-auto inline-flex min-h-11 max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-full border border-border-control bg-surface-1 px-3.5 py-2 text-center text-sm leading-snug text-fg-body transition duration-[140ms] ease-spring hover:bg-surface-2 active:scale-[0.98]"
    >
      <span>Comisión 0% en el lanzamiento</span>
      {/* M85: decorativo para lectores (aria-hidden) pero con contraste AA
          visual (fg-muted): axe mide el texto visible aunque sea decorativo. */}
      <span aria-hidden className="text-fg-muted">
        •
      </span>
      <span className="font-medium text-fg underline decoration-border underline-offset-4">Ver costos</span>
    </Link>
  );
}
