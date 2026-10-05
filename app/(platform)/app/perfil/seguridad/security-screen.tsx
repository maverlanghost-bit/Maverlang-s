"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { site } from "@/config/site";
import { useSession } from "@/lib/auth";
import { useExportKey } from "@/lib/auth/export-wallet";
import { useT } from "@/lib/hooks/use-t";

import { fill, SettingsFrame, SettingsPanel } from "../ui";

type ExportPhase = "warn" | "mock" | "privy" | "error";

/**
 * Privy 3.47 no lista sesiones activas. Tiene alta de 2FA (`useMfaEnrollment`),
 * pero no hay flujo en esta versión. En mock el SDK no se monta. Las dos filas
 * quedan en "Próximamente".
 */
export function SecurityScreen() {
  const { t } = useT();
  const { linkedLogins } = useSession();
  const exportKey = useExportKey();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<ExportPhase>("warn");
  const [pending, setPending] = useState(false);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setPhase("warn");
      setPending(false);
    }
  }

  async function confirmExport() {
    setPending(true);
    try {
      const result = await exportKey();
      setPhase(result === "mock" ? "mock" : "privy");
    } catch {
      setPhase("error");
    } finally {
      setPending(false);
    }
  }

  const finished = phase === "mock" || phase === "privy" || phase === "error";
  const result =
    phase === "mock" ? t.profile.exportMockDone : phase === "privy" ? t.profile.exportPrivyDone : phase === "error" ? t.profile.exportError : null;

  return (
    <SettingsFrame title={t.profile.security} description={t.profile.securityLead}>
      <SettingsPanel label={t.profile.methods}>
        <h2 className="px-4 pt-4 text-sm text-fg-muted md:px-6">{t.profile.methods}</h2>
        {linkedLogins.length === 0 ? (
          <p className="px-4 py-4 text-sm text-fg md:px-6">{t.profile.noMethods}</p>
        ) : (
          <ul>
            {linkedLogins.map((row) => (
              <li
                key={row.method}
                className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0 md:px-6"
              >
                <span className="text-sm text-fg">{row.method === "email" ? t.profile.methodEmail : t.profile.methodGoogle}</span>
                {row.detail ? <span className="truncate text-sm text-fg-muted">{row.detail}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </SettingsPanel>

      <SettingsPanel>
        <div className="flex flex-col gap-3 px-4 py-4 md:px-6">
          <Button type="button" variant="secondary" size="lg" className="w-full" onClick={() => onOpenChange(true)}>
            {t.profile.export}
          </Button>
        </div>
      </SettingsPanel>

      <SettingsPanel>
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-6">
          <div className="min-w-0">
            <p className="text-sm text-fg">{t.profile.sessions}</p>
            <p className="text-sm text-fg-muted">{t.profile.soonBody}</p>
          </div>
          <Badge>{t.profile.soon}</Badge>
        </div>
        <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="min-w-0">
            <p className="text-sm text-fg">{t.profile.twoFactor}</p>
            <p className="text-sm text-fg-muted">{t.profile.soonBody}</p>
          </div>
          <Badge>{t.profile.soon}</Badge>
        </div>
      </SettingsPanel>

      <Dialog open={open} onOpenChange={onOpenChange} title={t.profile.exportTitle} description={t.profile.exportWarn1}>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-fg-body">
          <li>{fill(t.profile.exportWarn2, { brand: site.name })}</li>
          <li>{t.profile.exportWarn3}</li>
          <li>{t.profile.exportWarn4}</li>
        </ul>
        {result ? (
          <p role="status" className="mt-4 text-sm text-fg">
            {result}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" size="lg" onClick={() => onOpenChange(false)}>
            {finished ? t.profile.deleteClose : t.profile.exportCancel}
          </Button>
          {finished ? null : (
            <Button type="button" variant="danger" size="lg" loading={pending} onClick={() => void confirmExport()}>
              {t.profile.exportContinue}
            </Button>
          )}
        </div>
      </Dialog>
    </SettingsFrame>
  );
}
