"use client";

import { useState } from "react";

import { MfaSettings } from "@/components/auth/mfa-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { IconChevron } from "@/components/ui/icons";
import { site } from "@/config/site";
import { useSession } from "@/lib/auth";
import { useExportKey } from "@/lib/auth/export-wallet";
import { useT } from "@/lib/hooks/use-t";

import { fill, PanelLabel, SettingsFrame, SettingsPanel } from "../ui";

type ExportPhase = "warn" | "mock" | "privy" | "error";

const CUSTODY = [
  { title: "Billetera Autocustodiada", detail: "Privy + Solana Ed25519 · Activa" },
  { title: "Libro Atómico de Retiros", detail: "Límites diarios y reserva previa" },
  { title: "Transporte y Sesión", detail: "TLS 1.3 · Verificación de origen" },
] as const;

/**
 * Privy 3.47 no lista sesiones activas: esa fila queda en "Próximamente".
 * El 2FA TOTP sí es real y se monta con <MfaSettings />. En mock el SDK no se monta.
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
      <SettingsPanel>
        <div className="px-4 py-4 md:px-5">
          <div className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full bg-up" aria-hidden="true" />
            <h2 className="text-[15px] leading-5 font-medium text-fg">Arquitectura de Custodia y Protección Activa</h2>
          </div>
          <dl className="mt-3 grid gap-2 sm:grid-cols-3">
            {CUSTODY.map((item) => (
              <div key={item.title} className="rounded-xl border border-border bg-bg px-3 py-2.5">
                <dt className="text-[13px] leading-5 font-medium text-fg">{item.title}</dt>
                <dd className="mt-0.5 text-[13px] leading-5 text-fg-muted">{item.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </SettingsPanel>

      <SettingsPanel label={t.profile.methods}>
        <PanelLabel>{t.profile.methods}</PanelLabel>
        {linkedLogins.length === 0 ? (
          <p className="px-4 pt-2 pb-4 text-[13px] leading-5 text-fg-muted md:px-5">{t.profile.noMethods}</p>
        ) : (
          <ul>
            {linkedLogins.map((row) => (
              <li
                key={row.method}
                className="flex min-h-12 items-center justify-between gap-4 border-t border-border/70 px-4 py-3.5 md:px-5"
              >
                <span className="text-[15px] leading-5 text-fg">
                  {row.method === "email" ? t.profile.methodEmail : t.profile.methodGoogle}
                </span>
                {row.detail ? (
                  <span className="min-w-0 truncate text-[13px] leading-5 text-fg-muted">{row.detail}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SettingsPanel>

      <SettingsPanel>
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-[15px] leading-5 text-fg outline-none transition-colors duration-[140ms] hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-fg/20 focus-visible:ring-inset md:px-5"
        >
          <span className="min-w-0">{t.profile.export}</span>
          <IconChevron className="size-3.5 shrink-0 -rotate-90 text-fg-muted" />
        </button>
      </SettingsPanel>

      <SettingsPanel>
        <div className="flex min-h-12 items-center justify-between gap-4 px-4 py-3.5 md:px-5">
          <div className="min-w-0">
            <p className="text-[15px] leading-5 text-fg">{t.profile.sessions}</p>
            <p className="mt-0.5 text-[13px] leading-5 text-fg-muted">{t.profile.soonBody}</p>
          </div>
          <Badge className="shrink-0">{t.profile.soon}</Badge>
        </div>
      </SettingsPanel>

      <MfaSettings />

      <Dialog open={open} onOpenChange={onOpenChange} title={t.profile.exportTitle} description={t.profile.exportWarn1}>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-fg-body">
          <li>{fill(t.profile.exportWarn2, { brand: site.name })}</li>
          <li>{t.profile.exportWarn3}</li>
          <li>{t.profile.exportWarn4}</li>
        </ul>
        {result ? (
          <p role="status" className="mt-4 text-sm leading-relaxed text-fg">
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
