"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { IconBack, IconChevron } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";
import type { Preferences } from "@/lib/types";

export function fill(template: string, values: Record<string, string>) {
  let next = template;
  for (const [key, value] of Object.entries(values)) next = next.split(`{${key}}`).join(value);
  return next;
}

export function regionName(code: string | null, language: Preferences["language"], missing: string): string {
  if (!code) return missing;
  try {
    const label = new Intl.DisplayNames([language], { type: "region" }).of(code);
    if (!label || label.toUpperCase() === code.toUpperCase()) return code;
    return label;
  } catch {
    return code;
  }
}

/** Fecha corta en Santiago, igual en servidor y cliente. */
export function formatWhen(input: string, language: Preferences["language"], unknown: string): string {
  const time = Date.parse(input);
  if (Number.isNaN(time)) return unknown;
  return new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeZone: "America/Santiago",
  }).format(time);
}

/*
 * Anatomía única de perfil y ajustes.
 *
 * Una sola escala dentro de estas pantallas: rótulo de fila 15/20, descripción
 * 13/20, rótulo de panel en `.label` (mono 12). Las pantallas nuevas toman
 * estas piezas en vez de repetir clases de fila.
 *
 * Hairline: `border-border/70`, el mismo del resto de la app, con
 * `first:border-t-0` para no duplicar el filo de la caja.
 */

/** Inset y alto táctil de una fila: 48px mínimo, con 44px de control adentro. */
const ROW = "flex min-h-12 items-center justify-between gap-3 px-4 py-3.5 md:px-5";

/** Fila que se puede tocar entera (link o button): foco y hover incluidos. */
const ROW_ACTION = cn(
  ROW,
  "w-full text-left text-[15px] leading-5 outline-none transition-colors duration-[140ms] hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20 focus-visible:ring-inset",
);

const HAIRLINE = "border-t border-border/70 first:border-t-0";

export function SettingsFrame({
  title,
  description,
  back = true,
  children,
}: {
  title: string;
  description?: string;
  /** `/app/ajustes` es destino de primer nivel: no lleva "volver". */
  back?: boolean;
  children: ReactNode;
}) {
  const { t } = useT();

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-1">
        {back ? (
          <Link
            href="/app/perfil"
            className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-full px-2 text-[13px] leading-5 font-medium text-fg-muted outline-none transition-colors duration-[140ms] hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20"
          >
            <IconBack className="size-3.5" />
            {t.profile.back}
          </Link>
        ) : null}
        <PageHeader title={title} description={description} />
      </div>
      {children}
    </div>
  );
}

/**
 * Panel de ajustes: mismo hairline y mismo radio que `Card`, sin borde
 * duplicado. Las filas van en `SettingsList`/`SettingsItem`.
 */
export function SettingsPanel({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <section aria-label={label} className="overflow-hidden rounded-xl bg-surface-1 shadow-card">
      {children}
    </section>
  );
}

/** Título interno de panel: rótulo mono, más callado que la H1 y que las filas. */
export function PanelLabel({ children }: { children: ReactNode }) {
  return <h2 className="label px-4 pt-4 pb-1 md:px-5">{children}</h2>;
}

/** Lista de filas dentro de un panel. */
export function SettingsList({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("flex flex-col", className)}>{children}</ul>;
}

/** Elemento de la lista: es quien dibuja el separador hairline. */
export function SettingsItem({ children }: { children: ReactNode }) {
  return <li className={HAIRLINE}>{children}</li>;
}

/** Contenido de una fila: etiqueta 15/20 y descripción corta 13/20. */
export function SettingsRowText({
  label,
  hint,
  className,
}: {
  label: string;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 flex-1 flex-col gap-0.5", className)}>
      <span className="text-[15px] leading-5 break-words text-fg">{label}</span>
      {hint ? <span className="text-[13px] leading-5 break-words text-fg-muted">{hint}</span> : null}
    </span>
  );
}

export function SettingsChevron() {
  return <IconChevron className="size-3.5 shrink-0 -rotate-90 text-fg-muted" />;
}

/** Fila estática: el mismo inset que las accionables, sin hover. */
export function SettingsRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(ROW, className)}>{children}</div>;
}

/** Fila de navegación: etiqueta, descripción opcional y chevron. */
export function SettingsLink({
  href,
  label,
  hint,
  chevron = true,
}: {
  href: string;
  label: string;
  hint?: ReactNode;
  chevron?: boolean;
}) {
  return (
    <Link href={href} className={cn(ROW_ACTION, "text-fg")}>
      <SettingsRowText label={label} hint={hint} />
      {chevron ? <SettingsChevron /> : null}
    </Link>
  );
}

/** Fila de navegación con contenido propio (varias líneas de dato). */
export function SettingsRowLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cn(ROW_ACTION, "text-fg", className)}>
      {children}
    </Link>
  );
}

/** Fila de acción: misma caja que el link; `danger` sólo para lo destructivo. */
export function SettingsButton({
  children,
  onClick,
  tone = "default",
  disabled = false,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        ROW_ACTION,
        "disabled:pointer-events-none disabled:opacity-50",
        tone === "danger" ? "text-down" : "text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Fila de formulario: rótulo, control a lo ancho y ayuda corta debajo. */
export function SettingsField({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2 px-4 py-4 md:px-5", HAIRLINE)}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="label">
          {label}
        </label>
      ) : (
        <p className="label">{label}</p>
      )}
      {children}
      {hint ? <p className="text-[13px] leading-5 text-fg-muted">{hint}</p> : null}
    </div>
  );
}

/** Valor de sólo lectura dentro de una fila de formulario. */
export function SettingsValue({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("min-w-0 text-[15px] leading-6 break-words text-fg", className)}>{children}</p>;
}

/** Prosa de apoyo: una sola medida y una sola escala en todas las subpantallas. */
export function SettingsNote({ children, role }: { children: ReactNode; role?: "status" | "alert" }) {
  return (
    <p role={role} className="max-w-prose text-[13px] leading-5 text-fg-muted">
      {children}
    </p>
  );
}

/** Cuerpo con el inset de fila, para estados de carga y error dentro del panel. */
export function SettingsPanelBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-4 py-4 md:px-5", className)}>{children}</div>;
}

/**
 * Fila con interruptor. `Switch` ya trae 44px de área táctil; acá se alinea el
 * rótulo a la escala de fila (15/20) y la descripción queda debajo, a lo ancho.
 */
export function SettingsToggle({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="px-4 py-3.5 md:px-5">
      <div className="[&_label]:text-[15px] [&_label]:leading-5">
        <Switch label={label} checked={checked} onCheckedChange={onCheckedChange} />
      </div>
      {hint ? <p className="-mt-1.5 text-[13px] leading-5 text-fg-muted">{hint}</p> : null}
    </div>
  );
}
