import type { ReactNode } from "react";

/**
 * Encabezado de página (D1/D3): una sola H1, bajada de 62ch y acciones
 * alineadas al pie del título. El ritmo vertical —título, 8px, bajada— es el
 * mismo que usan los estados vacío/error/carga, así que un contenedor
 * `flex flex-col gap-6` compone la página sin saltos.
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {/* D1: la H1 de página es una sola en todo el sitio (3xl/4xl). */}
        <h1 className="text-3xl leading-[1.1] tracking-tight text-balance text-fg sm:text-4xl">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-pretty text-fg-muted">{description}</p>
        ) : null}
      </div>
      {action ? (
        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">{action}</div>
      ) : null}
    </header>
  );
}
