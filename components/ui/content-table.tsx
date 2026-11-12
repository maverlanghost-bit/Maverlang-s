import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ContentTableColumn = {
  /** Clave de la celda en `ContentTableRow.cells`. */
  key: string;
  header: ReactNode;
  align?: "left" | "right" | "center";
  /** Clases extra para la columna (ancho, tipografía de cifras). */
  className?: string;
};

export type ContentTableRow = {
  id?: string;
  cells: Record<string, ReactNode>;
};

const alignClass = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

/**
 * Tabla de contenido (D1): scroll horizontal desde `sm` y, por debajo, la
 * misma información apilada con su rótulo. Sin JS y sin `table-fixed`, así
 * que nunca corta una cifra a 390 px.
 *
 * Sólo se muestra un bloque a la vez (`hidden`), de modo que el lector de
 * pantalla no lee la tabla dos veces.
 */
export function ContentTable({
  caption,
  columns,
  rows,
  className,
  minWidthClassName = "min-w-[34rem]",
}: {
  /** Descripción de la tabla para lectores de pantalla. */
  caption?: string;
  columns: ContentTableColumn[];
  rows: ContentTableRow[];
  className?: string;
  /** Ancho mínimo de la tabla en `sm+`; por defecto 34rem. */
  minWidthClassName?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dl className="flex flex-col divide-y divide-border border-y border-border sm:hidden">
        {rows.map((row, index) => (
          <div key={row.id ?? index} className="flex flex-col gap-1.5 py-3">
            {columns.map((column) => (
              <div key={column.key} className="flex items-baseline justify-between gap-4">
                <dt className="label-xs shrink-0">{column.header}</dt>
                <dd
                  className={cn(
                    "min-w-0 text-right text-sm leading-snug break-words text-fg-body",
                    (column.align ?? "left") === "left" && "text-left",
                    column.className,
                  )}
                >
                  {row.cells[column.key] ?? "—"}
                </dd>
              </div>
            ))}
          </div>
        ))}
      </dl>

      <div className="hidden overflow-x-auto sm:block">
        <table className={cn("w-full border-collapse text-sm", minWidthClassName)}>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr className="border-b border-border">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "label-xs py-2 pr-4 align-bottom whitespace-nowrap",
                    alignClass[column.align ?? "left"],
                    column.className,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, index) => (
              <tr key={row.id ?? index}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "py-2.5 pr-4 align-top text-fg-body",
                      alignClass[column.align ?? "left"],
                      /* Cifras: nunca parten el número en dos líneas. */
                      (column.align ?? "left") === "right" && "whitespace-nowrap tabular-nums",
                      column.className,
                    )}
                  >
                    {row.cells[column.key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
