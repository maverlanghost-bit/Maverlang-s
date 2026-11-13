"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { IconBack } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
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

export function SettingsFrame({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const { t } = useT();

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link
          href="/app/perfil"
          className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-full px-2 text-[13px] font-medium text-fg-muted outline-none transition duration-[140ms] hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20"
        >
          <IconBack className="size-3.5" />
          {t.profile.back}
        </Link>
        <PageHeader title={title} description={description} />
      </div>
      {children}
    </div>
  );
}

/**
 * Panel de ajustes: mismo hairline que `Card`, sin borde duplicado. Las filas
 * que van dentro usan `border-t border-border/70 first:border-t-0`.
 */
export function SettingsPanel({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <section aria-label={label} className="overflow-hidden rounded-2xl bg-surface-1 shadow-card">
      {children}
    </section>
  );
}

/** Título interno de panel: rótulo mono, más callado que la H1 y que las filas. */
export function PanelLabel({ children }: { children: ReactNode }) {
  return <h2 className="label px-4 pt-4 pb-2 md:px-5">{children}</h2>;
}
