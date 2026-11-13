"use client";

import { MfaSettings } from "@/components/auth/mfa-settings";
import { PageHeader } from "@/components/ui/page-header";
import { PreferencesForm } from "@/components/domain/preferences-form";
import { useT } from "@/lib/hooks/use-t";

import { SettingsPanel } from "../perfil/ui";

/** Un atajo: teclas, qué hace y la descripción tal como estaba. */
const SHORTCUTS = [
  {
    id: "paleta",
    keys: ["Ctrl + K", "⌘K"],
    label: "Paleta de comandos",
    description: "Paleta de comandos y búsqueda instantánea de acciones",
  },
  {
    id: "grafico",
    keys: ["←", "→"],
    label: "Recorrer el gráfico",
    description: "Inspeccionar precios punto por punto sobre cualquier gráfico",
  },
  {
    id: "cerrar",
    keys: ["Esc"],
    label: "Cerrar",
    description: "Cerrar hojas de compra/venta, comprobantes y buscador",
  },
] as const;

/** Tecla suelta: mono, hairline y sin sombra, como el resto de los datos. */
function Key({ children }: { children: string }) {
  return (
    <kbd className="rounded-md border border-border-strong bg-bg px-2 py-1 font-mono text-[11px] leading-4 font-medium text-fg-body">
      {children}
    </kbd>
  );
}

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
        aria-label="Atajos de teclado y navegación rápida"
        className="border-t border-border pt-8"
      >
        <h2 className="text-lg font-medium tracking-tight text-fg">
          Atajos de teclado y navegación rápida
        </h2>
        <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-fg-muted">
          Muévete por la plataforma como en una terminal profesional desde tu computador.
        </p>
        <dl className="mt-4 flex flex-col">
          {SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.id}
              className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b border-border py-3 last:border-b-0"
            >
              <dt className="min-w-0 flex-1 basis-48">
                <span className="block text-sm font-medium text-fg">{shortcut.label}</span>
                <span className="mt-0.5 block text-[13px] leading-5 text-fg-muted">
                  {shortcut.description}
                </span>
              </dt>
              <dd className="ml-auto flex shrink-0 flex-wrap items-center gap-1.5">
                {shortcut.keys.map((key) => (
                  <Key key={key}>{key}</Key>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
