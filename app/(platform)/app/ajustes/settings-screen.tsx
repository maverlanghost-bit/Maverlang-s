"use client";

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
    </div>
  );
}
