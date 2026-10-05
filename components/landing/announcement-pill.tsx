import Link from "next/link";

/**
 * Copy en uso: "Token en tu billetera Solana • Cómo funciona"
 * ALTERNATIVA: "Mercado ampliado: opera casi a cualquier hora • Cómo funciona"
 * ALTERNATIVA: "Comisión 0% en el lanzamiento • Ver costos"
 */
export function AnnouncementPill() {
  return (
    <Link
      href="/#como-funciona"
      className="mx-auto inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-full border border-border bg-bg px-3 py-1.5 text-center text-sm leading-snug text-fg-body transition duration-[140ms] ease-spring hover:bg-surface-2 active:scale-[0.98]"
    >
      <span>Token en tu billetera Solana</span>
      {/* ALTERNATIVA: Mercado ampliado: opera casi a cualquier hora */}
      {/* ALTERNATIVA: Comisión 0% en el lanzamiento */}
      <span aria-hidden className="text-fg-subtle">
        •
      </span>
      <span className="font-medium text-fg">Cómo funciona</span>
      {/* ALTERNATIVA (con la pill de comisión): Ver costos → /#costos */}
    </Link>
  );
}
