"use client";

import Link from "next/link";
import type { ReactNode } from "react";

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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/app/perfil"
          className="inline-flex min-h-11 w-fit items-center rounded-full px-2 text-sm text-fg-muted outline-none transition duration-[140ms] hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20"
        >
          {t.profile.back}
        </Link>
        <PageHeader title={title} description={description} />
      </div>
      {children}
    </div>
  );
}

export function SettingsPanel({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <section aria-label={label} className="overflow-hidden rounded-3xl border border-border bg-surface-1">
      {children}
    </section>
  );
}
