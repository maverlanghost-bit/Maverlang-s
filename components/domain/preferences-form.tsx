"use client";

import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/lib/auth/session-context";
import {
  useDisplayCurrency,
  useDisplayLanguage,
  useSetDisplayCurrency,
  useSetDisplayLanguage,
} from "@/lib/hooks/use-display-currency";
import { usePrefs } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import type { Currency, Preferences } from "@/lib/types";

/**
 * Moneda + idioma (M40). Con sesión guarda en la DB; sin sesión queda en local.
 * Sin duplicar lógica: la usan `/app/ajustes` y `/app/perfil/idioma`.
 */
export function PreferencesForm({ currencyFirst = true }: { currencyFirst?: boolean }) {
  const { t } = useT();
  const { toast } = useToast();
  const session = useSession();
  const prefs = usePrefs();
  const currency = useDisplayCurrency();
  const language = useDisplayLanguage();
  const setCurrency = useSetDisplayCurrency();
  const setLanguage = useSetDisplayLanguage();

  const isAuthed = session.status === "authenticated";
  if (isAuthed && prefs.isPending) {
    return <LoadingState label={t.states.loading} />;
  }
  if (isAuthed && (prefs.isError || !prefs.data)) {
    return (
      <ErrorState
        label={t.states.error}
        title={t.profile.prefsError}
        retryLabel={t.states.retry}
        onRetry={() => void prefs.refetch()}
      />
    );
  }

  function onLanguage(value: string) {
    if (value !== "es-CL" && value !== "en") return;
    const next: Preferences["language"] = value;
    if (next === language) return;
    try {
      setLanguage(next);
    } catch {
      toast({ title: t.profile.prefsError, tone: "down" });
    }
  }

  function onCurrency(value: string) {
    if (value !== "CLP" && value !== "USD") return;
    const next: Currency = value;
    if (next === currency) return;
    try {
      setCurrency(next);
    } catch {
      toast({ title: t.profile.prefsError, tone: "down" });
    }
  }

  const currencyBlock = (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-4 first:border-t-0 md:px-6">
      <p className="text-sm text-fg-muted">{t.profile.currencyLabel}</p>
      <SegmentedControl
        label={t.profile.currencyLabel}
        fullWidth
        value={currency}
        onChange={onCurrency}
        options={[
          { value: "CLP", label: t.profile.clp },
          { value: "USD", label: t.profile.usd },
        ]}
      />
      <p className="text-sm leading-relaxed text-fg-muted">{t.profile.currencyHint}</p>
    </div>
  );

  const languageBlock = (
    <div className="flex flex-col gap-3 px-4 py-4 md:px-6">
      <p className="text-sm text-fg-muted">{t.profile.languageLabel}</p>
      <SegmentedControl
        label={t.profile.languageLabel}
        fullWidth
        value={language}
        onChange={onLanguage}
        options={[
          { value: "es-CL", label: t.profile.spanish },
          { value: "en", label: t.profile.english },
        ]}
      />
    </div>
  );

  return (
    <>
      {currencyFirst ? currencyBlock : languageBlock}
      {currencyFirst ? languageBlock : currencyBlock}
    </>
  );
}
