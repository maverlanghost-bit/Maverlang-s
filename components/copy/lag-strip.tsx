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
 * Trazabilidad del dato: cuándo se publicó y cuándo lo actualizó Fraccion.si.
 * La fecha del dato (`asOf`) y su atraso viven en la línea de metadatos de la
 * cabecera, así que aquí no se repiten. Sin fecha de publicación, no inventa
 * el tramo.
 */
export function LagStrip({
  filedAt,
  publishedAt,
  generatedAt,
  lagNote,
  className,
}: {
  filedAt?: string | null;
  publishedAt?: string | null;
  generatedAt?: string | null;
  lagNote?: string | null;
  className?: string;
}) {
  const published = publishedAt || filedAt || null;
  const updated = generatedAt || published;
  const ago = updated ? agoLabel(updated) : null;
  const parts: string[] = [];
  if (published) parts.push(`Publicado el ${formatFeedDate(published)}`);
  parts.push(ago ? `Actualizado por Fraccion.si ${ago}` : "Actualizado por Fraccion.si");

  return (
    <div className={cn("flex flex-col gap-1 text-[13px] leading-5 text-fg-muted", className)}>
      <p>{parts.join(" · ")}</p>
      {lagNote ? <p>{lagNote}</p> : null}
    </div>
  );
}
