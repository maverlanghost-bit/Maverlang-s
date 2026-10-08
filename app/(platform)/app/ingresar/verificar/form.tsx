"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AuthFrame, CredentialField } from "@/components/auth/auth-frame";
import { Button } from "@/components/ui/button";
import { isTotpCode, listTotp, mfaReturnPath, needsMfaStep, verifyTotp, type MfaErrorCode } from "@/lib/auth/mfa";
import { useSession } from "@/lib/auth/session-context";
import { useT } from "@/lib/hooks/use-t";

type Phase = "loading" | "ready" | "error";

export function MfaVerifyForm() {
  const { t } = useT();
  const router = useRouter();
  const params = useSearchParams();
  const { logout } = useSession();
  const nextParam = params.get("next");
  const [phase, setPhase] = useState<Phase>("loading");
  const [attempt, setAttempt] = useState(0);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [errorCode, setErrorCode] = useState<MfaErrorCode | null>(null);
  const [shapeError, setShapeError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const needed = await needsMfaStep();
      if (cancelled) return;
      if (!needed) {
        router.replace(mfaReturnPath(nextParam));
        return;
      }
      const listed = await listTotp();
      if (cancelled) return;
      if (!listed.ok) {
        setErrorCode(listed.code);
        setPhase("error");
        return;
      }
      const factor = listed.factors[0];
      if (!factor) {
        router.replace(mfaReturnPath(nextParam));
        return;
      }
      setFactorId(factor.id);
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, nextParam, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !factorId) return;
    if (!isTotpCode(code)) {
      setShapeError(true);
      setErrorCode(null);
      return;
    }
    setBusy(true);
    setShapeError(false);
    const verified = await verifyTotp(factorId, code);
    setBusy(false);
    if (!verified.ok) {
      setErrorCode(verified.code);
      return;
    }
    const dest = mfaReturnPath(nextParam);
    router.refresh();
    router.push(dest);
  }

  const alert = shapeError ? t.mfa.codeShape : errorCode ? t.mfa.errors[errorCode] : null;

  return (
    <AuthFrame title={t.mfa.loginTitle} lead={t.mfa.loginLead}>
      {phase === "loading" ? <p className="mt-6 text-sm text-fg-muted">{t.states.loading}</p> : null}
      {phase === "error" ? (
        <div className="mt-6">
          {alert ? (
            <p className="text-center text-sm text-down" role="alert">
              {alert}
            </p>
          ) : null}
          <Button type="button" variant="secondary" size="lg" className="mt-4 w-full" onClick={() => {
            setErrorCode(null);
            setPhase("loading");
            setAttempt((value) => value + 1);
          }}>
            {t.states.retry}
          </Button>
        </div>
      ) : null}
      {phase === "ready" ? (
        <form className="mt-6" noValidate onSubmit={(event) => void submit(event)}>
          <CredentialField
            id="mfa-login-code"
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
          <Button type="submit" className="mt-6 w-full" size="lg" loading={busy}>
            {t.mfa.verify}
          </Button>
        </form>
      ) : null}
      <Button type="button" variant="ghost" size="lg" className="mt-3 w-full" disabled={busy} onClick={() => void logout()}>
        {t.mfa.leave}
      </Button>
    </AuthFrame>
  );
}
