import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Dato destacado (T70): rótulo, valor grande en mono y una nota opcional.
 * El valor lo entrega quien llama; esta pieza no calcula ni inventa cifras.
 */
export function StatTile({
  label,
  value,
  hint,
  inverse = false,
  size = "md",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  inverse?: boolean;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className={cn("label", inverse && "text-inverse-muted")}>{label}</p>
      <p
        className={cn(
          "num mt-2 leading-none tracking-tight",
          size === "lg" ? "text-5xl sm:text-6xl" : "text-2xl sm:text-3xl",
          inverse ? "text-white" : "text-fg",
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className={cn("mt-2 text-sm leading-relaxed", inverse ? "text-inverse-muted" : "text-fg-muted")}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Fila de datos separados por hairlines verticales; se apila en móvil. */
export function StatRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid gap-6 border-t border-border pt-6 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border sm:[&>*]:px-6 sm:[&>*:first-child]:pl-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
