"use client";

import { MfaSettings } from "@/components/auth/mfa-settings";
import { PageHeader } from "@/components/ui/page-header";
import { PreferencesForm } from "@/components/domain/preferences-form";
import { useT } from "@/lib/hooks/use-t";

import { SettingsPanel } from "../perfil/ui";

/** Ajustes (M40): primero Moneda, luego Idioma. Pública: el visitante guarda en local. */
export function SettingsScreen() {
  const { t } = useT();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.pages.settings.title} description={t.pages.settings.lead} />
      <SettingsPanel label={t.pages.settings.title}>
        <PreferencesForm currencyFirst />
      </SettingsPanel>
      <MfaSettings />
      <section
        aria-label="Atajos de Teclado y Terminal"
        className="rounded-3xl border border-border/80 bg-white p-5 shadow-xs sm:p-6"
      >
        <h2 className="text-lg font-semibold tracking-tight text-fg">
          Atajos de teclado y navegación rápida
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          Muévete por la plataforma como en una terminal profesional desde tu computador.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-surface-1/60 p-4">
            <span className="flex flex-wrap items-center gap-1">
              <kbd className="rounded-md border border-border/80 bg-white px-2 py-1 text-[11px] font-semibold text-fg shadow-xs">
                Ctrl + K
              </kbd>
              <span className="text-[11px] text-fg-muted">/</span>
              <kbd className="rounded-md border border-border/80 bg-white px-2 py-1 text-[11px] font-semibold text-fg shadow-xs">
                ⌘K
              </kbd>
            </span>
            <p className="text-xs leading-relaxed text-fg-muted">
              Paleta de comandos y búsqueda instantánea de acciones
            </p>
          </div>
          <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-surface-1/60 p-4">
            <span className="flex flex-wrap items-center gap-1">
              <kbd className="rounded-md border border-border/80 bg-white px-2 py-1 text-[11px] font-semibold text-fg shadow-xs">
                ←
              </kbd>
              <kbd className="rounded-md border border-border/80 bg-white px-2 py-1 text-[11px] font-semibold text-fg shadow-xs">
                →
              </kbd>
            </span>
            <p className="text-xs leading-relaxed text-fg-muted">
              Inspeccionar precios punto por punto sobre cualquier gráfico
            </p>
          </div>
          <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-surface-1/60 p-4">
            <span className="flex flex-wrap items-center gap-1">
              <kbd className="rounded-md border border-border/80 bg-white px-2 py-1 text-[11px] font-semibold text-fg shadow-xs">
                Esc
              </kbd>
            </span>
            <p className="text-xs leading-relaxed text-fg-muted">
              Cerrar hojas de compra/venta, comprobantes y buscador
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
