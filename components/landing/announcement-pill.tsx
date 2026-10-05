import Link from "next/link";

/**
 * Copy en uso: "Comisión 0% en el lanzamiento • Ver costos"
 * Alternativas para Manu:
 * - "Nuevo: compra Apple desde $1.000 • Ver cómo funciona"
 * - "Fracciones de acciones de EE.UU. • Ver costos"
 */
export function AnnouncementPill() {
  return (
    <Link
      href="/#costos"
      className="mx-auto inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-full border border-border bg-bg px-3 py-1.5 text-center text-sm leading-snug text-fg-body transition duration-[140ms] ease-spring hover:bg-surface-2 active:scale-[0.98]"
    >
      <span>Comisión 0% en el lanzamiento</span>
      <span aria-hidden className="text-fg-subtle">
        •
      </span>
      <span className="font-medium text-fg">Ver costos</span>
    </Link>
  );
}
