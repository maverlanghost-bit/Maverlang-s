import Link from "next/link";

/**
 * Copy en uso: "Opera las 24 horas, de lunes a viernes • Cómo funciona"
 * ALTERNATIVA: "Token en tu billetera Solana • Cómo funciona"
 * ALTERNATIVA: "Comisión 0% en el lanzamiento • Ver costos"
 */
export function AnnouncementPill() {
  return (
    <Link
      href="/#como-funciona"
      className="mx-auto inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-full border border-border bg-bg px-3 py-1.5 text-center text-sm leading-snug text-fg-body transition duration-[140ms] ease-spring hover:bg-surface-2 active:scale-[0.98]"
    >
      <span>Opera las 24 horas, de lunes a viernes</span>
      {/* ALTERNATIVA: Token en tu billetera Solana */}
      {/* ALTERNATIVA: Comisión 0% en el lanzamiento */}
      <span aria-hidden className="text-fg-subtle">
        •
      </span>
      <span className="font-medium text-fg">Cómo funciona</span>
      {/* ALTERNATIVA (con la pill de comisión): Ver costos → /#costos */}
    </Link>
  );
}
