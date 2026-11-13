/**
 * Copy en uso: "Comisión 0% en el lanzamiento"
 * Dejó de ser píldora: en el hero es una línea de texto (sin cápsula, relleno
 * ni borde). El enlace a costos vive en la cabecera y en la sección de costos,
 * así que el hero no suma una acción más.
 *
 * ALTERNATIVA: "Opera 24/7 · Cómo funciona"
 * ALTERNATIVA: "En tu propia billetera · Cómo funciona"
 */
export function AnnouncementPill() {
  return (
    <p className="max-w-full text-center text-sm leading-5 text-pretty text-fg-muted">
      <span className="font-medium whitespace-nowrap text-fg">Comisión 0%</span> en el lanzamiento
    </p>
  );
}
