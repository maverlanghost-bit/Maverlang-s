"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { AuthFrame, authLinkClass, CredentialField } from "@/components/auth/auth-frame";
import { FormAlert } from "@/components/auth/form-alert";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/lib/auth";
import { loginErrorMessage } from "@/lib/auth/login-errors";
import { updatePassword } from "@/lib/auth/login-client";
import { restablecerSchema } from "@/lib/auth/login-schema";

function Spinner() {
  return (
    <svg className="size-4 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Expired() {
  return (
    <AuthFrame title="El enlace no sirve" lead={loginErrorMessage("expired")}>
      <Button asChild className="mt-6 w-full" size="lg">
        <Link href="/app/recuperar">Pedir otro enlace</Link>
      </Button>
      <p className="mt-1 text-center text-[13px] leading-relaxed text-fg-muted">
        <Link href="/app/ingresar" className={authLinkClass}>
          Volver a ingresar
        </Link>
      </p>
    </AuthFrame>
  );
}

export function RestablecerForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const { status } = useSession();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [fields, setFields] = useState<{ password?: string; passwordConfirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === "loading") {
    return (
      <AuthFrame title="Nueva contraseña">
        <p className="mt-6 flex min-h-11 items-center gap-2 text-sm text-fg-muted" role="status" aria-live="polite">
          <Spinner />
          Cargando…
        </p>
      </AuthFrame>
    );
  }

  if (status !== "authenticated" || params.get("error") === "expirado") {
    return <Expired />;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setFormError(null);
    const parsed = restablecerSchema.safeParse({ password, passwordConfirm });
    if (!parsed.success) {
      const next: { password?: string; passwordConfirm?: string } = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if ((key === "password" || key === "passwordConfirm") && !next[key]) next[key] = issue.message;
      }
      setFields(next);
      return;
    }
    setFields({});
    setBusy(true);
    const message = await updatePassword(parsed.data.password);
    setBusy(false);
    if (message) {
      setFormError(message);
      return;
    }
    toast({ title: "Contraseña actualizada", tone: "up" });
    router.refresh();
    router.push("/app");
  }

  return (
    <AuthFrame title="Nueva contraseña" lead="Elige una contraseña de al menos 8 caracteres.">
      <form className="mt-5" noValidate aria-busy={busy} onSubmit={(event) => void submit(event)}>
        <CredentialField
          id="clave"
          label="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          value={password}
          error={fields.password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <PasswordStrengthMeter password={password} />
        <CredentialField
          id="clave2"
          label="Confirmar contraseña"
          type="password"
          autoComplete="new-password"
          value={passwordConfirm}
          error={fields.passwordConfirm}
          onChange={(event) => setPasswordConfirm(event.target.value)}
        />
        <Button type="submit" className="mt-5 w-full" size="lg" loading={busy}>
          Guardar contraseña
        </Button>
      </form>
      {formError ? (
        <>
          <FormAlert>{formError}</FormAlert>
          {formError === loginErrorMessage("expired") ? (
            <p className="mt-1 text-[13px]">
              <Link href="/app/recuperar" className={authLinkClass}>
                Pedir otro enlace
              </Link>
            </p>
          ) : null}
        </>
      ) : null}
    </AuthFrame>
  );
}
