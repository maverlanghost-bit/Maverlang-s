"use client";

import { useEffect, useState } from "react";

import { CredentialField } from "@/components/auth/auth-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  enrollTotp,
  isTotpCode,
  listTotp,
  removeTotp,
  verifyTotp,
  type MfaErrorCode,
  type TotpEnrollment,
} from "@/lib/auth/mfa";
import { useSession } from "@/lib/auth/session-context";
import { useT } from "@/lib/hooks/use-t";

type Phase = "loading" | "inactive" | "enrolling" | "active" | "disabling";

export function MfaSettings() {
  const { t } = useT();
  const session = useSession();
  const [phase, setPhase] = useState<Phase>("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [errorCode, setErrorCode] = useState<MfaErrorCode | null>(null);
  const [shapeError, setShapeError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  useEffect(() => {
    if (session.status !== "authenticated") return;
    let cancelled = false;
    void (async () => {
      const listed = await listTotp();
      if (cancelled) return;
      if (!listed.ok) {
        setErrorCode(listed.code);
        setPhase("inactive");
        return;
      }
      const factor = listed.factors[0];
      setFactorId(factor?.id ?? null);
      setPhase(factor ? "active" : "inactive");
    })();
    return () => {
      cancelled = true;
    };
  }, [session.status]);

  function resetCode() {
    setCode("");
    setErrorCode(null);
    setShapeError(false);
  }

  async function activate() {
    if (busy) return;
    setBusy(true);
    resetCode();
    const enrolled = await enrollTotp();
    setBusy(false);
    if (!enrolled.ok) {
      setErrorCode(enrolled.code);
      return;
    }
    setEnrollment(enrolled.enrollment);
    setPhase("enrolling");
  }

  async function confirmEnroll() {
    if (busy || !enrollment) return;
    if (!isTotpCode(code)) {
      setShapeError(true);
      setErrorCode(null);
      return;
    }
    setBusy(true);
    setShapeError(false);
    const verified = await verifyTotp(enrollment.factorId, code);
    setBusy(false);
    if (!verified.ok) {
      setErrorCode(verified.code);
      return;
    }
    setFactorId(enrollment.factorId);
    setEnrollment(null);
    resetCode();
    setPhase("active");
  }

  async function cancelEnroll() {
    if (busy) return;
    const pending = enrollment?.factorId;
    setEnrollment(null);
    resetCode();
    setPhase("inactive");
    if (pending) await removeTotp(pending);
  }

  async function confirmDisable() {
    if (busy || !factorId) return;
    if (!isTotpCode(code)) {
      setShapeError(true);
      setErrorCode(null);
      return;
    }
    setBusy(true);
    setShapeError(false);
    const verified = await verifyTotp(factorId, code);
    if (!verified.ok) {
      setBusy(false);
      setErrorCode(verified.code);
      return;
    }
    const removed = await removeTotp(factorId);
    setBusy(false);
    if (!removed.ok) {
      setErrorCode(removed.code);
      return;
    }
    setFactorId(null);
    resetCode();
    setPhase("inactive");
  }

  async function copySecret() {
    if (!enrollment?.secret) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const alert = shapeError ? t.mfa.codeShape : errorCode ? t.mfa.errors[errorCode] : null;

  return (
    <section aria-label={t.mfa.title} className="overflow-hidden rounded-3xl border border-border bg-surface-1">
      <div className="flex flex-col gap-3 px-4 py-4 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-fg">{t.mfa.title}</h2>
          {phase === "active" ? <Badge tone="up">{t.mfa.active}</Badge> : null}
        </div>
        <p className="text-sm leading-relaxed text-fg-body">{t.mfa.lead}</p>

        {session.status === "loading" || (session.status === "authenticated" && phase === "loading") ? (
          <p className="text-sm text-fg-muted">{t.states.loading}</p>
        ) : null}

        {session.status === "unauthenticated" ? <p className="text-sm text-fg-muted">{t.mfa.needSession}</p> : null}

        {session.status === "authenticated" && phase === "inactive" ? (
          <div className="flex flex-col gap-3">
            {alert ? null : <p className="text-sm text-fg-muted">{t.mfa.inactive}</p>}
            {errorCode === "unavailable" ? null : (
              <Button type="button" variant="secondary" size="lg" className="w-full sm:w-fit" loading={busy} onClick={() => void activate()}>
                {t.mfa.activate}
              </Button>
            )}
          </div>
        ) : null}

        {session.status === "authenticated" && phase === "enrolling" && enrollment ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-relaxed text-fg-body">{t.mfa.enrollLead}</p>
            {enrollment.qrCode.startsWith("data:") ? (
              // El QR es un SVG en data URI. next/image no lo optimiza; la CSP ya permite data:.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={enrollment.qrCode} alt={t.mfa.qrAlt} width={192} height={192} className="size-48 bg-white p-2" />
            ) : null}
            <div>
              <p className="text-sm font-medium text-fg">{t.mfa.secretLabel}</p>
              <p className="mt-1 text-sm text-fg-muted">{t.mfa.secretHint}</p>
              <p translate="no" className="mt-2 break-all font-mono text-sm text-fg">
                {enrollment.secret}
              </p>
              <Button type="button" variant="ghost" size="sm" className="mt-2 min-h-11" onClick={() => void copySecret()}>
                {copied ? t.mfa.copied : t.mfa.copySecret}
              </Button>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void confirmEnroll();
              }}
            >
              <CredentialField
                id="mfa-enroll-code"
                label={t.mfa.codeLabel}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoCapitalize="off"
                spellCheck={false}
                value={code}
                error={alert ?? undefined}
                onChange={(event) => {
                  setCode(event.target.value);
                  setShapeError(false);
                  setErrorCode(null);
                }}
              />
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button type="submit" size="lg" loading={busy}>
                  {t.mfa.confirm}
                </Button>
                <Button type="button" variant="secondary" size="lg" disabled={busy} onClick={() => void cancelEnroll()}>
                  {t.mfa.cancel}
                </Button>
              </div>
            </form>
          </div>
        ) : null}

        {session.status === "authenticated" && phase === "active" ? (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full sm:w-fit"
            onClick={() => {
              resetCode();
              setPhase("disabling");
            }}
          >
            {t.mfa.deactivate}
          </Button>
        ) : null}

        {session.status === "authenticated" && phase === "disabling" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void confirmDisable();
            }}
          >
            <p className="text-sm leading-relaxed text-fg-body">{t.mfa.disableLead}</p>
            <CredentialField
              id="mfa-disable-code"
              label={t.mfa.codeLabel}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoCapitalize="off"
              spellCheck={false}
              value={code}
              error={alert ?? undefined}
              onChange={(event) => {
                setCode(event.target.value);
                setShapeError(false);
                setErrorCode(null);
              }}
            />
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button type="submit" variant="danger" size="lg" loading={busy}>
                {t.mfa.deactivate}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                disabled={busy}
                onClick={() => {
                  resetCode();
                  setPhase("active");
                }}
              >
                {t.mfa.cancel}
              </Button>
            </div>
          </form>
        ) : null}

        {session.status === "authenticated" && phase === "inactive" && alert ? (
          <p className="text-sm text-down" role="alert">
            {alert}
          </p>
        ) : null}
      </div>
    </section>
  );
}
