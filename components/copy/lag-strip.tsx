import { cn } from "@/lib/cn";
import { daysSince, formatFeedDate } from "@/lib/copy/lag";

/** "hoy" / "ayer" / "hace N días" a partir de una fecha ISO. null si no se puede leer. */
function agoLabel(iso: string): string | null {
  const days = daysSince(iso);
  if (days === null) return null;
  const safe = Math.max(0, days);
  if (safe === 0) return "hoy";
  if (safe === 1) return "ayer";
  return `hace ${safe} días`;
}

/**
 * Franja de trazabilidad del dato: «Dato al … · Publicado el … · Actualizado
 * por Fraccion.si hace …». Sin fecha de publicación, no inventa el tramo.
 */
export function LagStrip({
  asOf,
  filedAt,
  publishedAt,
  generatedAt,
  lagNote,
  className,
}: {
  asOf: string;
  filedAt?: string | null;
  publishedAt?: string | null;
  generatedAt?: string | null;
  lagNote?: string | null;
  className?: string;
}) {
  const published = publishedAt || filedAt || null;
  const updated = generatedAt || published;
  const parts = [`Dato al ${formatFeedDate(asOf)}`];
  if (published) parts.push(`Publicado el ${formatFeedDate(published)}`);
  const ago = updated ? agoLabel(updated) : null;
  parts.push(ago ? `Actualizado por Fraccion.si ${ago}` : "Actualizado por Fraccion.si");

  return (
    <div className={cn("flex flex-col gap-1 text-xs leading-relaxed text-fg-muted", className)}>
      <p>{parts.join(" · ")}</p>
      {lagNote ? <p className="text-xs leading-relaxed text-fg-muted">{lagNote}</p> : null}
    </div>
  );
}
