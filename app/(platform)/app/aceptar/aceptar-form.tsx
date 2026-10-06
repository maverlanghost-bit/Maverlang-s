"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { CheckField } from "@/app/(platform)/app/onboarding/panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { addConsent, ApiError } from "@/lib/api/client";
import { DEMO_LEGAL_MESSAGE } from "@/lib/auth/registro-schema";
import { publishDemoMetadata } from "@/lib/auth/registro-client";

/**
 * Pantalla corta (M43): cuentas con sesión pero sin aceptación
 * (caso raro: cuentas viejas a medias). Sólo pide el mismo
 * checkbox del registro demo. Guarda vía `/api/me/consents`,
 * alinea el JWT y refresca la sesión.
 */
export function AceptarForm({
  next,
  terminosVersion,
  privacidadVersion,
}: {
  next: string | null;
  terminosVersion: string;
  privacidadVersion: string;
}) {
  const router = useRouter();
  const lock = useRef(false);
  const [checked, setChecked] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || busy) return;
    if (!checked) {
      setFormError(DEMO_LEGAL_MESSAGE);
      return;
    }
    lock.current = true;
    setBusy(true);
    setFormError(null);
    try {
      await Promise.all([
        addConsent({ doc: "terminos", version: terminosVersion }),
        addConsent({ doc: "privacidad", version: privacidadVersion }),
      ]);
      const metaError = await publishDemoMetadata(
        { terminos: terminosVersion, privacidad: privacidadVersion },
        new Date().toISOString(),
      );
      if (metaError) {
        setFormError(metaError);
        return;
      }
      router.push(next ?? "/app");
      router.refresh();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "No pudimos guardar tu aceptación. Inténtalo otra vez.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-md shadow-float">
      <form className="mt-6" onSubmit={(event) => void onSubmit(event)} noValidate>
        <h1 className="text-3xl text-balance">Acepta los documentos</h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-body">
          Para usar la demo tienes que aceptar los Términos y Condiciones y la Política de Privacidad.
        </p>
        <div className="mt-4">
          <CheckField
            checked={checked}
            onChange={setChecked}
            onBlur={() => {}}
            inputRef={() => {}}
            error={formError && !checked ? formError : undefined}
            label={
              <>
                Acepto los{" "}
                <Link
                  href="/legal/terminos"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline decoration-border underline-offset-4 hover:decoration-fg"
                >
                  Términos y Condiciones
                </Link>{" "}
                y la{" "}
                <Link
                  href="/legal/privacidad"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline decoration-border underline-offset-4 hover:decoration-fg"
                >
                  Política de Privacidad
                </Link>
                .
              </>
            }
          />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-fg-muted">Borrador. [REVISIÓN ABOGADO]</p>
        {formError && checked ? (
          <p className="mt-4 text-sm text-down" role="alert">
            {formError}
          </p>
        ) : null}
        <div className="mt-6">
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            Continuar
          </Button>
        </div>
      </form>
    </Card>
  );
}
