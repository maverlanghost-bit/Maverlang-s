"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AuthFrame, AuthLegal, CredentialField } from "@/components/auth/auth-frame";
import { Button } from "@/components/ui/button";
import { loginErrorMessage, type LoginErrorCode } from "@/lib/auth/login-errors";
import { resendConfirmation, signInWithPassword } from "@/lib/auth/login-client";
import { loginSchema } from "@/lib/auth/login-schema";
import { onboardingPath } from "@/lib/auth/paths";

function GoogleIcon() {
  return (
    <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M21.6 12.23c0-.74-.07-1.45-.19-2.13H12v4.03h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.89-1.74 2.99-4.3 2.99-7.42Z"
      />
      <path
        fill="currentColor"
        d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.23-2.5c-.9.6-2.04.96-3.39.96-2.6 0-4.81-1.76-5.6-4.12H3.06v2.58A10 10 0 0 0 12 22Z"
      />
      <path
        fill="currentColor"
        d="M6.4 13.91A6 6 0 0 1 6.08 12c0-.66.11-1.3.32-1.91V7.51H3.06A10 10 0 0 0 2 12c0 1.61.39 3.14 1.06 4.49l3.34-2.58Z"
      />
      <path
        fill="currentColor"
        d="M12 5.97c1.47 0 2.79.5 3.83 1.5l2.87-2.87C16.95 2.98 14.7 2 12 2A10 10 0 0 0 3.06 7.51l3.34 2.58C7.19 7.73 9.4 5.97 12 5.97Z"
      />
    </svg>
  );
}

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
    setBusy(false);
    if (!result.ok) {
      setFailure(result.code);
      return;
    }
    const dest = result.onboarded ? next : onboardingPath(next);
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
      <form className="mt-6" noValidate onSubmit={(event) => void submit(event)}>
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
        <p className="mt-3 text-sm">
          <Link
            href="/app/recuperar"
            className="font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
          >
            Olvidé mi contraseña
          </Link>
        </p>
        <Button type="submit" className="mt-6 w-full" size="lg" loading={busy}>
          Ingresar
        </Button>
      </form>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="mt-3 w-full"
        disabled
        aria-label="Continuar con Google. Próximamente"
      >
        <GoogleIcon />
        Próximamente
      </Button>
      {alert ? (
        <p className={`mt-4 text-center text-sm ${alertIsError ? "text-down" : "text-fg-body"}`} role={alertIsError ? "alert" : "status"}>
          {alert}
        </p>
      ) : null}
      {failure === "unconfirmed" ? (
        <Button type="button" variant="ghost" size="lg" className="mt-3 w-full" disabled={busy} onClick={() => void resend()}>
          Reenviar correo de confirmación
        </Button>
      ) : null}
      <p className="mt-6 text-center text-sm leading-relaxed text-fg-muted">
        <Link href={createHref} className="font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg">
          Crear cuenta
        </Link>
      </p>
      <AuthLegal />
    </AuthFrame>
  );
}
