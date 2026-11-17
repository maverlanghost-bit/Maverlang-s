/**
 * Copy en uso: "Comisión 0% en el lanzamiento"
 * T70: vuelve a ser una píldora real (borde, radio completo y fondo `surface-1`)
 * para que el hero tenga un primer elemento con forma. No es un enlace: el
 * detalle de costos vive en la cabecera y en su propia sección.
 *
 * ALTERNATIVA: "Opera 24/7 · Cómo funciona"
 * ALTERNATIVA: "En tu propia billetera · Cómo funciona"
 */
export function AnnouncementPill() {
  return (
    <p className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-surface-1 px-3.5 py-1.5 text-center text-sm leading-5 text-pretty text-fg-muted">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-fg" />
      <span>
        <span className="font-medium whitespace-nowrap text-fg">Comisión 0%</span> en el lanzamiento
      </span>
    </p>
  );
}
