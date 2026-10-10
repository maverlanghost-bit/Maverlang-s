"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { AuthFrame, CredentialField } from "@/components/auth/auth-frame";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/lib/auth";
import { loginErrorMessage } from "@/lib/auth/login-errors";
import { updatePassword } from "@/lib/auth/login-client";
import { restablecerSchema } from "@/lib/auth/login-schema";

function Expired() {
  return (
    <AuthFrame title="El enlace no sirve" lead={loginErrorMessage("expired")}>
      <Button asChild className="mt-6 w-full" size="lg">
        <Link href="/app/recuperar">Pedir otro enlace</Link>
      </Button>
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
        <p className="mt-6 text-sm text-fg-muted">Cargando…</p>
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
      <form className="mt-6" noValidate onSubmit={(event) => void submit(event)}>
        <CredentialField
          id="clave"
          label="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          value={password}
          error={fields.password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <CredentialField
          id="clave2"
          label="Confirmar contraseña"
          type="password"
          autoComplete="new-password"
          value={passwordConfirm}
          error={fields.passwordConfirm}
          onChange={(event) => setPasswordConfirm(event.target.value)}
        />
        <Button type="submit" className="mt-6 w-full" size="lg" loading={busy}>
          Guardar contraseña
        </Button>
      </form>
      {formError ? (
        <div className="mt-4">
          <p className="text-center text-sm break-words leading-relaxed text-down" role="alert">
            {formError}
          </p>
          {formError === loginErrorMessage("expired") ? (
            <p className="mt-3 text-center text-sm">
              <Link
                href="/app/recuperar"
                className="inline-flex min-h-11 items-center justify-center rounded-sm px-2 font-medium text-fg underline decoration-border underline-offset-4 outline-none hover:decoration-fg focus-visible:ring-4 focus-visible:ring-fg/20"
              >
                Pedir otro enlace
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
    </AuthFrame>
  );
}
