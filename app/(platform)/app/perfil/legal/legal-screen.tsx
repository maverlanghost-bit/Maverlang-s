"use client";

import Link from "next/link";

import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useConsents } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import type { Consent, LegalDoc } from "@/lib/types";

import { formatWhen, PanelLabel, SettingsFrame, SettingsPanel } from "../ui";

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
      <p className="text-[13px] leading-5 text-fg-muted">{t.profile.legalDraft}</p>
      {consents.isPending ? (
        <SettingsPanel>
          <div className="px-4 py-4 md:px-5">
            <LoadingState variant="list" label={t.states.loading} />
          </div>
        </SettingsPanel>
      ) : consents.isError ? (
        <ErrorState
          label={t.states.error}
          title={t.profile.legalError}
          retryLabel={t.states.retry}
          onRetry={() => void consents.refetch()}
        />
      ) : rows.length === 0 ? (
        <p className="text-[13px] leading-5 text-fg-muted">{t.profile.legalEmpty}</p>
      ) : (
        <SettingsPanel label={t.profile.legalLead}>
          <ul>
            {rows.map((row) => {
              const doc = (
                <>
                  <span className="text-[15px] leading-5 text-fg">{t.profile.docs[row.doc]}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] leading-5 text-fg-muted">
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
                </>
              );
              const rowClass =
                "flex min-h-14 flex-col justify-center gap-0.5 px-4 py-3.5 outline-none md:px-5";
              return (
                <li key={`${row.doc}-${row.version}`} className="border-t border-border/70 first:border-t-0">
                  {row.doc === "us_person" ? (
                    <div className={rowClass}>{doc}</div>
                  ) : (
                    <Link
                      href={`/legal/${row.doc}`}
                      className={`${rowClass} transition-colors duration-[140ms] hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20 focus-visible:ring-inset`}
                    >
                      {doc}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </SettingsPanel>
      )}

      <SettingsPanel label={t.profile.legalLinks}>
        <PanelLabel>{t.profile.legalLinks}</PanelLabel>
        <ul>
          {LINKS.map(([doc, href]) => (
            <li key={doc} className="border-t border-border/70">
              <Link
                href={href}
                className="flex min-h-12 items-center px-4 py-3.5 text-[15px] leading-5 text-fg outline-none transition-colors duration-[140ms] hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20 focus-visible:ring-inset md:px-5"
              >
                {t.profile.docs[doc]}
              </Link>
            </li>
          ))}
        </ul>
      </SettingsPanel>
    </SettingsFrame>
  );
}
