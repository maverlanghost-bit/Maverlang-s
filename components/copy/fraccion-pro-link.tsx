"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

/**
 * «Fraccion Pro incluye Copiar» (encargo §1.3 y §3 S9).
 *
 * Quien ya paga Fraccion Pro puede vincular su comprobante firmado (Ed25519)
 * en vez de pagar dos veces. El comprobante lo emite Fraccion y trae
 * `{ sub_email_sha256, plan: "pro", exp }`; acá sólo se pega el texto y viaja a
 * `POST /api/copy/fraccion-pro` con la sesión. El correo NO se escribe ni se
 * envía: el servidor compara el hash del correo de la sesión con el del
 * comprobante. Este componente no guarda nada ni decide el acceso: si el
 * servidor no valida, no hay acceso.
 */

const DATE_FORMAT = new Intl.DateTimeFormat("es-CL", { dateStyle: "long" });

function isoDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return DATE_FORMAT.format(date);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function readError(raw: unknown): { code: string | null; message: string | null } {
  const root = asRecord(raw);
  const error = root ? asRecord(root.error) : null;
  return {
    code: error ? readString(error.code) : null,
    message: error ? readString(error.message) : null,
  };
}

/** `data.currentPeriodEnd` de la respuesta, sin confiar en el borde. */
function readPeriodEnd(raw: unknown): string | null {
  const root = asRecord(raw);
  const data = root ? asRecord(root.data) : null;
  return data ? readString(data.currentPeriodEnd) : null;
}

type Notice = { tone: "ok" | "warn" | "down"; text: string };

function noticeClass(tone: Notice["tone"]): string {
  if (tone === "ok") return "border-up/30 bg-up-bg text-up";
  if (tone === "down") return "border-down/30 bg-down-bg text-down";
  return "border-warn/30 bg-warn-bg text-warn";
}

export function FraccionProLink({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const fieldId = useId();
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [linked, setLinked] = useState(false);

  async function link() {
    const clean = token.trim();
    if (pending || clean === "") return;
    setPending(true);
    setNotice(null);
    try {
      const response = await fetch("/api/copy/fraccion-pro", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ token: clean }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const error = readError(body);
        setNotice({
          tone: error.code === "FEATURE_DISABLED" ? "warn" : "down",
          text:
            error.message ??
            (response.status === 401
              ? "Entra con tu cuenta de Maverlang para vincular tu Fraccion Pro."
              : "No pudimos vincular el comprobante. Revisa que sea el que te entregó Fraccion.si."),
        });
        return;
      }
      const periodEnd = readPeriodEnd(body);
      setLinked(true);
      setToken("");
      setNotice({
        tone: "ok",
        text: periodEnd
          ? `Listo: vinculamos tu Fraccion Pro. Copiar queda activo hasta el ${isoDate(periodEnd) ?? "la fecha del comprobante"}.`
          : "Listo: vinculamos tu Fraccion Pro.",
      });
      router.refresh();
    } catch {
      setNotice({
        tone: "down",
        text: "No pudimos vincular el comprobante. Revisa tu conexión e intenta de nuevo.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight">¿Ya pagas Fraccion Pro?</h2>
        <p className="text-sm leading-relaxed text-fg-body">
          <span className="font-medium">Fraccion Pro incluye Copiar.</span> Si tu suscripción a Fraccion Pro está
          vigente, vincula el comprobante que te entrega Fraccion.si y no pagas dos veces.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={fieldId} className="text-sm font-medium text-fg">
          Comprobante de Fraccion Pro
        </label>
        <textarea
          id={fieldId}
          value={token}
          onChange={(event) => setToken(event.target.value)}
          rows={3}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          disabled={disabled || pending || linked}
          aria-describedby={`${fieldId}-help`}
          placeholder="Pega aquí el comprobante que te entregó Fraccion.si"
          className="min-h-24 w-full resize-y rounded-md border border-border-control bg-surface-2 px-3 py-2 font-mono text-xs leading-relaxed text-fg transition duration-[140ms] ease-spring placeholder:font-sans placeholder:text-fg-muted focus-visible:border-fg disabled:opacity-40"
        />
        <p id={`${fieldId}-help`} className="text-[13px] leading-relaxed text-fg-muted">
          Se compara un hash del correo de tu cuenta con el del comprobante: tu correo no se envía ni se guarda
          en claro en esta vinculación. El comprobante queda ligado al correo de tu cuenta.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          size="lg"
          variant="secondary"
          className="min-h-12 w-full sm:w-auto"
          disabled={disabled || linked || token.trim().length === 0}
          loading={pending}
          onClick={() => void link()}
        >
          {linked ? "Fraccion Pro vinculado" : "Vincular comprobante"}
        </Button>
        <p className="text-xs leading-relaxed text-fg-muted">
          Si el comprobante venció, pide uno nuevo en Fraccion.si.
        </p>
      </div>

      {notice ? (
        <p aria-live="polite" className={cn("rounded-xl border p-3 text-sm leading-relaxed", noticeClass(notice.tone))}>
          {notice.text}
        </p>
      ) : null}
    </Card>
  );
}
