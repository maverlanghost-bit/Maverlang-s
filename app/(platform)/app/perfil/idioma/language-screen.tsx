"use client";

import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/toast";
import { usePrefs } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { useUpdatePrefs } from "@/lib/hooks/use-update-prefs";
import type { Currency, Preferences } from "@/lib/types";

import { SettingsFrame, SettingsPanel } from "../ui";

export function LanguageScreen() {
  const { t } = useT();
  const { toast } = useToast();
  const prefs = usePrefs();
  const update = useUpdatePrefs();
  const data = prefs.data;

  if (prefs.isPending) {
    return (
      <SettingsFrame title={t.profile.language} description={t.profile.languageLead}>
        <LoadingState label={t.states.loading} />
      </SettingsFrame>
    );
  }
  if (prefs.isError || !data) {
    return (
      <SettingsFrame title={t.profile.language} description={t.profile.languageLead}>
        <ErrorState
          label={t.states.error}
          title={t.profile.prefsError}
          retryLabel={t.states.retry}
          onRetry={() => void prefs.refetch()}
        />
      </SettingsFrame>
    );
  }

  function onLanguage(value: string) {
    if (value !== "es-CL" && value !== "en") return;
    const language: Preferences["language"] = value;
    update({ language }, () => toast({ title: t.profile.prefsError, tone: "down" }));
  }

  function onCurrency(value: string) {
    if (value !== "CLP" && value !== "USD") return;
    const displayCurrency: Currency = value;
    update({ displayCurrency }, () => toast({ title: t.profile.prefsError, tone: "down" }));
  }

  return (
    <SettingsFrame title={t.profile.language} description={t.profile.languageLead}>
      <SettingsPanel>
        <div className="flex flex-col gap-3 px-4 py-4 md:px-6">
          <p className="text-sm text-fg-muted">{t.profile.languageLabel}</p>
          <SegmentedControl
            label={t.profile.languageLabel}
            fullWidth
            value={data.language}
            onChange={onLanguage}
            options={[
              { value: "es-CL", label: t.profile.spanish },
              { value: "en", label: t.profile.english },
            ]}
          />
        </div>
        <div className="flex flex-col gap-3 border-t border-border px-4 py-4 md:px-6">
          <p className="text-sm text-fg-muted">{t.profile.currencyLabel}</p>
          <SegmentedControl
            label={t.profile.currencyLabel}
            fullWidth
            value={data.displayCurrency}
            onChange={onCurrency}
            options={[
              { value: "CLP", label: t.profile.clp },
              { value: "USD", label: t.profile.usd },
            ]}
          />
          <p className="text-sm leading-relaxed text-fg-muted">{t.profile.currencyHint}</p>
        </div>
      </SettingsPanel>
    </SettingsFrame>
  );
}
