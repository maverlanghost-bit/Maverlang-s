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

/**
 * Ajustes: la misma lista con hairline que Perfil. Moneda e idioma son filas
 * de un panel; la verificación en dos pasos mantiene su bloque propio y los
 * atajos de teclado sólo aparecen donde hay teclado.
 */
export function SettingsScreen() {
  const { t } = useT();
  return (
    <div className="flex w-full max-w-2xl min-w-0 flex-col gap-6">
      <PageHeader title={t.pages.settings.title} description={t.pages.settings.lead} />

      <SettingsPanel label={t.profile.language}>
        <PreferencesForm currencyFirst />
      </SettingsPanel>

      {/* MfaSettings trae su propio borde y radio: se alinea al radio del sistema sin tocar el componente. */}
      <div className="[&>section]:rounded-xl">
        <MfaSettings />
      </div>

      <section aria-labelledby="atajos-teclado" className="hidden min-w-0 flex-col gap-3 lg:flex">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="atajos-teclado" className="text-[17px] leading-6 font-medium text-fg">
            Atajos de teclado
          </h2>
          <p className="max-w-[62ch] text-[13px] leading-5 text-fg-muted">
            Muévete por la plataforma como en una terminal profesional desde tu computador.
          </p>
        </div>
        <dl className="flex min-w-0 flex-col border-y border-border">
          {SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.id}
              className="flex min-w-0 items-start justify-between gap-6 border-t border-border px-4 py-3 first:border-t-0 md:px-5"
            >
              <dt className="min-w-0">
                <span className="block text-[15px] leading-5 font-medium text-fg">{shortcut.label}</span>
                <span className="mt-0.5 block text-[13px] leading-5 text-fg-muted">{shortcut.description}</span>
              </dt>
              <dd className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
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
