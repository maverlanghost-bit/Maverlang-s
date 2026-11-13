"use client";

import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useConsents } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import type { Consent, LegalDoc } from "@/lib/types";

import {
  formatWhen,
  PanelLabel,
  SettingsFrame,
  SettingsItem,
  SettingsLink,
  SettingsList,
  SettingsNote,
  SettingsPanel,
  SettingsPanelBody,
  SettingsRow,
  SettingsRowLink,
  SettingsRowText,
} from "../ui";

const DOC_ORDER: readonly LegalDoc[] = ["terminos", "privacidad", "riesgos", "us_person"];

const LINKS = [
  ["terminos", "/legal/terminos"],
  ["privacidad", "/legal/privacidad"],
  ["riesgos", "/legal/riesgos"],
  ["comisiones", "/legal/comisiones"],
] as const;

function ordered(rows: Consent[]): Consent[] {
  return [...rows].sort((a, b) => {
    const byDoc = DOC_ORDER.indexOf(a.doc) - DOC_ORDER.indexOf(b.doc);
    if (byDoc !== 0) return byDoc;
    return b.acceptedAt.localeCompare(a.acceptedAt);
  });
}

export function LegalScreen() {
  const { t, language } = useT();
  const consents = useConsents();
  const rows = consents.data ? ordered(consents.data) : [];

  return (
    <SettingsFrame title={t.profile.legal} description={t.profile.legalLead}>
      <SettingsNote>{t.profile.legalDraft}</SettingsNote>
      {consents.isPending ? (
        <SettingsPanel>
          <SettingsPanelBody>
            <LoadingState variant="list" label={t.states.loading} />
          </SettingsPanelBody>
        </SettingsPanel>
      ) : consents.isError ? (
        <ErrorState
          label={t.states.error}
          title={t.profile.legalError}
          retryLabel={t.states.retry}
          onRetry={() => void consents.refetch()}
        />
      ) : rows.length === 0 ? (
        <SettingsNote>{t.profile.legalEmpty}</SettingsNote>
      ) : (
        <SettingsPanel label={t.profile.legal}>
          <SettingsList>
            {rows.map((row) => {
              const doc = (
                <SettingsRowText
                  label={t.profile.docs[row.doc]}
                  hint={
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>
                        <span className="sr-only">{t.profile.docVersion}: </span>
                        <span className="num break-all">{row.version}</span>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        <span className="sr-only">{t.profile.docDate}: </span>
                        {formatWhen(row.acceptedAt, language, t.profile.unknownDate)}
                      </span>
                    </span>
                  }
                />
              );
              return (
                <SettingsItem key={`${row.doc}-${row.version}`}>
                  {row.doc === "us_person" ? (
                    <SettingsRow>{doc}</SettingsRow>
                  ) : (
                    <SettingsRowLink href={`/legal/${row.doc}`}>{doc}</SettingsRowLink>
                  )}
                </SettingsItem>
              );
            })}
          </SettingsList>
        </SettingsPanel>
      )}

      <SettingsPanel label={t.profile.legalLinks}>
        <PanelLabel>{t.profile.legalLinks}</PanelLabel>
        <SettingsList>
          {LINKS.map(([doc, href]) => (
            <SettingsItem key={doc}>
              <SettingsLink href={href} label={t.profile.docs[doc]} />
            </SettingsItem>
          ))}
        </SettingsList>
      </SettingsPanel>
    </SettingsFrame>
  );
}
