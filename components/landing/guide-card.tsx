import Link from "next/link";

/**
 * Tarjeta editorial de una guía (T70). La "portada" es tipográfica: el número
 * de la guía grande, en mono, y el rótulo de categoría. Sin imágenes. Toda la
 * tarjeta es un solo enlace.
 */
export function GuideCard({
  href,
  number,
  title,
  description,
  readingMinutes,
  updatedAt,
  updatedLabel,
}: {
  href: string;
  number: number;
  title: string;
  description: string;
  readingMinutes: number;
  updatedAt: string;
  /** Fecha ya formateada en es-CL. */
  updatedLabel: string;
}) {
  return (
    <Link
      href={href}
      className="group flex h-full min-h-11 flex-col overflow-hidden rounded-bento border border-border bg-bg transition-colors hover:border-border-strong motion-reduce:transition-none"
    >
      <div
        aria-hidden="true"
        className="flex items-end justify-between gap-4 border-b border-border bg-surface-1 px-6 pt-8 pb-5 transition-colors group-hover:bg-surface-2 motion-reduce:transition-none md:px-7"
      >
        <span className="num text-6xl leading-none tracking-tight text-fg sm:text-7xl">
          {String(number).padStart(2, "0")}
        </span>
        <span className="label">Guía</span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-6 md:p-7">
        <div className="flex items-start justify-between gap-4">
          <h3 className="min-w-0 text-xl leading-snug font-semibold tracking-tight text-pretty text-fg">
            {title}
          </h3>
          <span
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-lg leading-snug text-fg-muted transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-fg motion-reduce:transition-none"
          >
            →
          </span>
        </div>
        <p className="text-[15px] leading-relaxed text-pretty text-fg-body">{description}</p>
        <p className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-1.5 pt-2 font-mono text-[13px] leading-snug text-fg-muted">
          <span>{readingMinutes} min de lectura</span>
          <span aria-hidden="true">·</span>
          <time dateTime={updatedAt} className="tabular-nums">
            Actualizada el {updatedLabel}
          </time>
        </p>
      </div>
    </Link>
  );
}
