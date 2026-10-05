"use client";

import Link from "next/link";

import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useConsents } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import type { Consent, LegalDoc } from "@/lib/types";

import { formatWhen, SettingsFrame, SettingsPanel } from "../ui";

const DOC_ORDER: readonly LegalDoc[] = ["terminos", "privacidad", "riesgos"];

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
      <p className="text-sm text-fg-muted">{t.profile.legalDraft}</p>
      {consents.isPending ? (
        <LoadingState label={t.states.loading} />
      ) : consents.isError ? (
        <ErrorState
          label={t.states.error}
          title={t.profile.legalError}
          retryLabel={t.states.retry}
          onRetry={() => void consents.refetch()}
        />
      ) : rows.length === 0 ? (
        <p className="text-sm text-fg-muted">{t.profile.legalEmpty}</p>
      ) : (
        <SettingsPanel>
          <table className="w-full table-fixed text-left text-sm">
            <caption className="sr-only">{t.profile.legalLead}</caption>
            <thead>
              <tr className="text-fg-muted">
                <th scope="col" className="w-[44%] px-4 py-3 font-normal md:px-6">
                  {t.profile.doc}
                </th>
                <th scope="col" className="w-[30%] px-2 py-3 font-normal">
                  {t.profile.docVersion}
                </th>
                <th scope="col" className="w-[26%] px-4 py-3 font-normal md:px-6">
                  {t.profile.docDate}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.doc}-${row.version}`} className="border-t border-border">
                  <th scope="row" className="px-4 py-3 font-normal md:px-6">
                    <Link
                      href={`/legal/${row.doc}`}
                      className="text-fg underline decoration-border underline-offset-2 outline-none hover:decoration-fg focus-visible:ring-4 focus-visible:ring-fg/20"
                    >
                      {t.profile.docs[row.doc]}
                    </Link>
                  </th>
                  <td className="num px-2 py-3 break-all text-fg">{row.version}</td>
                  <td className="px-4 py-3 text-fg-muted md:px-6">
                    {formatWhen(row.acceptedAt, language, t.profile.unknownDate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SettingsPanel>
      )}

      <SettingsPanel label={t.profile.legalLinks}>
        <h2 className="px-4 pt-4 text-sm text-fg-muted md:px-6">{t.profile.legalLinks}</h2>
        <ul>
          {LINKS.map(([doc, href]) => (
            <li key={doc} className="border-b border-border last:border-b-0">
              <Link
                href={href}
                className="flex min-h-11 items-center px-4 py-3 text-sm text-fg outline-none transition duration-[140ms] hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20 focus-visible:ring-inset md:px-6"
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
