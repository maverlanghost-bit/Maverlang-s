"use client";

import type { ReactNode } from "react";

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

/** Fila de preferencia: rótulo mono, control y una ayuda opcional debajo. */
function Block({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border/70 px-4 py-4 first:border-t-0 md:px-5">
      <p className="label">{label}</p>
      {children}
      {hint ? <p className="max-w-prose text-[13px] leading-relaxed text-fg-muted">{hint}</p> : null}
    </div>
  );
}

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
    return (
      <div className="px-4 py-4 md:px-5">
        <LoadingState variant="list" label={t.states.loading} />
      </div>
    );
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
    <Block label={t.profile.currencyLabel} hint={t.profile.currencyHint}>
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
    </Block>
  );

  const languageBlock = (
    <Block label={t.profile.languageLabel}>
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
    </Block>
  );

  return (
    <>
      {currencyFirst ? currencyBlock : languageBlock}
      {currencyFirst ? languageBlock : currencyBlock}
    </>
  );
}
