"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { WAITLIST_SUCCESS_MESSAGE } from "@/lib/waitlist/message";

export type WaitlistSource = "landing" | "cuenta_real";

/**
 * Lista de espera de la cuenta Real (M45). Correo + checkbox obligatorio +
 * campo trampa oculto (`website`): si viene lleno, el servidor responde 200
 * sin guardar. En éxito muestra siempre "¡Listo! Te avisaremos.".
 */
export function WaitlistForm({
  source,
  className,
}: {
  source: WaitlistSource;
  className?: string;
}) {
  const uid = useId();
  const emailId = `${uid}-waitlist-email`;
  const consentId = `${uid}-waitlist-consent`;
  const errorId = `${uid}-waitlist-error`;
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const isLanding = source === "landing";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || done) return;
    setError(null);
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 254) {
      setError("Revisa el correo e inténtalo de nuevo.");
      return;
    }
    if (!consent) {
      setError("Acepta que te contactemos para avisarte del lanzamiento.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: value, consent, website, source }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: unknown }
          | null;
        const raw = body?.error;
        const message =
          typeof raw === "string" && raw.length > 0
            ? raw
            : typeof raw === "object" && raw !== null && "message" in raw &&
                typeof (raw as { message?: unknown }).message === "string" &&
                ((raw as { message: string }).message.length > 0)
              ? (raw as { message: string }).message
              : "No pudimos guardar tu correo. Inténtalo de nuevo.";
        setError(message);
        return;
      }
      setDone(true);
    } catch {
      setError("No pudimos guardar tu correo. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    // Cuenta Real: comportamiento intacto (e2e/unit lo esperan simple).
    if (!isLanding) {
      return (
        <p role="status" className={cn("text-sm font-medium text-fg", className)}>
          {WAITLIST_SUCCESS_MESSAGE}
        </p>
      );
    }
    // Landing: estado "gracias" claro, con animación suave del design
    // system (`animate-fade-in`). Reemplaza el form: no se puede reenviar.
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "animate-fade-in rounded-2xl border border-border bg-surface-1 px-5 py-6 text-center",
          className,
        )}
      >
        <span
          aria-hidden="true"
          className="mx-auto flex size-11 items-center justify-center rounded-full bg-fg text-white"
        >
          <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true">
            <path
              d="m5 12.5 4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <p className="mt-3 text-base font-medium text-fg">¡Gracias por sumarte!</p>
        <p className="mt-1 text-sm leading-relaxed text-fg-body">{WAITLIST_SUCCESS_MESSAGE}</p>
        <p className="mt-1 text-sm leading-relaxed text-fg-muted">
          Te escribiremos cuando abra la cuenta Real.
        </p>
      </div>
    );
  }

  return (
    <form
      aria-label="Lista de espera"
      noValidate
      onSubmit={(event) => void onSubmit(event)}
      className={cn("w-full text-left", className)}
    >
      <label htmlFor={emailId} className="text-sm font-medium text-fg">
        Correo
      </label>
      <Input
        id={emailId}
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="tu@correo.cl"
        aria-label="Correo"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={busy}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="mt-2"
      />
      <div className="mt-3 flex min-h-11 items-start gap-3">
        <input
          id={consentId}
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          disabled={busy}
          className="mt-0.5 size-5 shrink-0 accent-fg"
        />
        <label htmlFor={consentId} className="cursor-pointer text-sm leading-relaxed text-fg">
          Acepto que me contacten sobre el lanzamiento y la{" "}
          <Link
            href="/legal/privacidad"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline decoration-border underline-offset-4 hover:decoration-fg"
          >
            Política de Privacidad
          </Link>
          .
        </label>
      </div>
      {/* Trampa anti-bots: oculta para personas. Si viene llena, el servidor responde 200 sin guardar. */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(event) => setWebsite(event.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      {error ? (
        <p id={errorId} role="alert" aria-live="assertive" className="mt-2 text-sm text-down">
          {error}
        </p>
      ) : null}
      <Button type="submit" loading={busy} className="mt-3 w-full min-h-11">
        {busy ? "Enviando…" : "Avísame"}
      </Button>
    </form>
  );
}
