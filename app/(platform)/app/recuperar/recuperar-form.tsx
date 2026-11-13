"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

import { AuthFrame, authLinkClass, CredentialField } from "@/components/auth/auth-frame";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { requestPasswordReset } from "@/lib/auth/login-client";
import { recuperarSchema } from "@/lib/auth/login-schema";

export function RecuperarForm() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setFormError(null);
    const parsed = recuperarSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Ingresa un correo válido.");
      return;
    }
    setFieldError(undefined);
    setBusy(true);
    const result = await requestPasswordReset(parsed.data.email);
    setBusy(false);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <AuthFrame title="Revisa tu correo" lead="Te enviamos un correo con un enlace.">
        <p className="mt-5 max-w-[60ch] text-sm break-words leading-relaxed text-pretty text-fg-body">
          Si ese correo tiene cuenta, el enlace ya va en camino. Ábrelo para elegir una contraseña nueva. Si no llega, revisa el correo no deseado.
        </p>
        <p className="mt-3 border-l-2 border-border pl-4 text-[13px] leading-relaxed text-pretty text-fg-muted">
          Enlace de un solo uso con expiración automática. Nunca compartas este enlace con terceros.
        </p>
        <Button asChild className="mt-6 w-full" size="lg">
          <Link href="/app/ingresar">Volver a ingresar</Link>
        </Button>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="Recuperar contraseña" lead="Escribe tu correo y te enviamos un enlace para elegir una contraseña nueva.">
      <form className="mt-5" noValidate aria-busy={busy} onSubmit={(event) => void submit(event)}>
        <CredentialField
          id="correo"
          label="Correo"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          error={fieldError}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Button type="submit" className="mt-5 w-full" size="lg" loading={busy}>
          Enviar enlace
        </Button>
      </form>
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <p className="mt-1 text-center text-[13px] leading-relaxed text-fg-muted">
        <Link href="/app/ingresar" className={authLinkClass}>
          Volver a ingresar
        </Link>
      </p>
    </AuthFrame>
  );
}
