"use client";

import { PreferencesForm } from "@/components/domain/preferences-form";
import { useT } from "@/lib/hooks/use-t";

import { SettingsFrame, SettingsPanel } from "../ui";

/** Pantalla anterior: ahora redirige a /app/ajustes; se conserva por compatibilidad. */
export function LanguageScreen() {
  const { t } = useT();
  return (
    <SettingsFrame title={t.profile.language} description={t.profile.languageLead}>
      <SettingsPanel>
        <PreferencesForm currencyFirst={false} />
      </SettingsPanel>
    </SettingsFrame>
  );
}
