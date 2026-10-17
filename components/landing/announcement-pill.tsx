import Link from "next/link";

/**
 * Copy en uso: "Opera 24/7 • Cómo funciona"
 * ALTERNATIVA: "En tu propia billetera • Cómo funciona"
 * ALTERNATIVA: "Comisión 0% en el lanzamiento • Ver costos"
 */
export function AnnouncementPill() {
  return (
    <Link
      href="/#como-funciona"
      className="mx-auto inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-full border border-border bg-bg px-3 py-1.5 text-center text-sm leading-snug text-fg-body transition duration-[140ms] ease-spring hover:bg-surface-2 active:scale-[0.98]"
    >
      <span>Opera 24/7</span>
      {/* ALTERNATIVA: En tu propia billetera */}
      {/* ALTERNATIVA: Comisión 0% en el lanzamiento */}
      {/* M85: decorativo para lectores (aria-hidden) pero con contraste AA
          visual (fg-muted): axe mide el texto visible aunque sea decorativo. */}
      <span aria-hidden className="text-fg-muted">
        •
      </span>
      <span className="font-medium text-fg">Cómo funciona</span>
      {/* ALTERNATIVA (con la pill de comisión): Ver costos → /#costos */}
    </Link>
  );
}
