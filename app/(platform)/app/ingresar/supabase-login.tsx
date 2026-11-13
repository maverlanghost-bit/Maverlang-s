"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AuthFrame, AuthLegal, authLinkClass, CredentialField } from "@/components/auth/auth-frame";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { loginErrorMessage, type LoginErrorCode } from "@/lib/auth/login-errors";
import { resendConfirmation, signInWithPassword } from "@/lib/auth/login-client";
import { loginSchema } from "@/lib/auth/login-schema";
import { mfaVerifyPath, needsMfaStep } from "@/lib/auth/mfa";
import { aceptarPath } from "@/lib/auth/paths";

function issuesOf(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const fields: { email?: string; password?: string } = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if ((key === "email" || key === "password") && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export function SupabaseLogin({
  next,
  createHref,
  linkError,
}: {
  next: string;
  createHref: string;
  linkError: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fields, setFields] = useState<{ email?: string; password?: string }>({});
  const [failure, setFailure] = useState<LoginErrorCode | null>(linkError === "enlace" ? "expired" : null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setNotice(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFields(issuesOf(parsed.error));
      setFailure(null);
      return;
    }
    setFields({});
    setBusy(true);
    const result = await signInWithPassword(parsed.data.email, parsed.data.password);
    if (!result.ok) {
      setBusy(false);
      setFailure(result.code);
      return;
    }
    const dest = result.demoReady ? next : aceptarPath(next);
    if (await needsMfaStep()) {
      setBusy(false);
      // Sin refresh de esta pantalla: con sesión, el gate manda /app/ingresar al destino y se salta el código.
      router.push(mfaVerifyPath(dest));
      return;
    }
    setBusy(false);
    router.refresh();
    router.push(dest);
  }

  async function resend() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const message = await resendConfirmation(email, next);
    setBusy(false);
    if (message) {
      setNotice(message);
      return;
    }
    setFailure(null);
    setNotice("Te reenviamos el correo de confirmación.");
  }

  const alert = notice ?? (failure ? loginErrorMessage(failure) : null);
  const alertIsError = alert !== null && alert !== "Te reenviamos el correo de confirmación.";

  return (
    <AuthFrame title="Ingresa" lead="Usa el correo y la contraseña de tu cuenta.">
      <form className="mt-5" noValidate aria-busy={busy} onSubmit={(event) => void submit(event)}>
        <CredentialField
          id="correo"
          label="Correo"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          error={fields.email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <CredentialField
          id="clave"
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          value={password}
          error={fields.password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <p className="mt-1 flex justify-end">
          <Link href="/app/recuperar" className={authLinkClass}>
            Olvidé mi contraseña
          </Link>
        </p>
        <Button type="submit" className="mt-4 w-full" size="lg" loading={busy}>
          Ingresar
        </Button>
      </form>
      <p className="mt-3 text-[13px] leading-snug text-fg-muted">Ingreso con Google: próximamente</p>
      {alert ? <FormAlert tone={alertIsError ? "error" : "info"}>{alert}</FormAlert> : null}
      {failure === "unconfirmed" ? (
        <Button type="button" variant="ghost" size="md" className="mt-1 w-full" disabled={busy} onClick={() => void resend()}>
          Reenviar correo de confirmación
        </Button>
      ) : null}
      <p className="mt-1 text-center text-[13px] leading-relaxed text-fg-muted">
        <Link href={createHref} className={authLinkClass}>
          Crear cuenta
        </Link>
      </p>
      <AuthLegal />
    </AuthFrame>
  );
}
