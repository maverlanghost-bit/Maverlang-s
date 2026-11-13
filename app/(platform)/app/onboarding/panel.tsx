"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import { Controller, type Control } from "react-hook-form";

import { US_PERSON_DECLARATION_TEXT, US_PERSON_QUESTION, US_PERSON_YES_LABEL, type UsPersonDeclaration } from "@/config/compliance";
import { PESO_DEPOSITS_ENABLED } from "@/config/onramp";
import { site } from "@/config/site";
import { BLOCKED_COUNTRY_MESSAGE } from "@/lib/auth/registro-schema";
import { Button } from "@/components/ui/button";
import { Select, type SelectOption } from "@/components/ui/select";
import type { LegalVersions } from "./draft";
import type { OnboardingInput, OnboardingOutput } from "./schema";

type OnboardingControl = Control<OnboardingInput, unknown, OnboardingOutput>;

const DOC_LINKS = {
  terminos: { href: "/legal/terminos", name: "Términos y condiciones" },
  privacidad: { href: "/legal/privacidad", name: "Política de privacidad" },
  riesgos: { href: "/legal/riesgos", name: "Divulgación de riesgos" },
} as const;

export const RISK_POINTS = [
  "Puedes perder parte o todo lo que pusiste. Nada en el sitio promete un resultado.",
  "El token es tuyo y queda en tu billetera. No te convierte en accionista registrado ni te da derecho a voto.",
  "El emisor puede congelar o restringir el token.",
  "El precio puede alejarse de la acción, sobre todo fuera del horario de la bolsa o con poca liquidez.",
] as const;

export function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-[13px] leading-snug text-pretty text-down" role="alert">
      {message}
    </p>
  );
}

export function CheckField({
  checked,
  onChange,
  onBlur,
  inputRef,
  label,
  error,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  onBlur: () => void;
  inputRef: (element: HTMLInputElement | null) => void;
  label: ReactNode;
  error?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      {/* La fila entera es la etiqueta: 44 px de alto y el texto también marca. */}
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
        <input
          ref={inputRef}
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          onBlur={onBlur}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="mt-0.5 size-5 shrink-0 accent-fg"
        />
        <span className="text-sm leading-relaxed text-fg">{label}</span>
      </label>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export function CountryFields({
  options,
  value,
  onChange,
  error,
}: {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const errorId = useId();
  return (
    <div className="mt-5">
      <p className="max-w-[60ch] text-[13px] leading-relaxed text-pretty text-fg-muted">
        Elige el país donde resides y tu nacionalidad. Si alguno está restringido, la cuenta no está disponible.
        [REVISIÓN ABOGADO]
      </p>
      <div className="mt-4">
        <Select
          id="onboarding-country"
          label="País de residencia"
          options={options}
          value={value}
          onValueChange={onChange}
          placeholder="Elige tu país"
        />
        <FieldError id={errorId} message={error} />
      </div>
    </div>
  );
}

export function NationalityField({
  options,
  value,
  onChange,
  error,
}: {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const errorId = useId();
  return (
    <div className="mt-5">
      <Select
        id="onboarding-nationality"
        label="Nacionalidad"
        options={options}
        value={value}
        onValueChange={onChange}
        placeholder="Elige tu nacionalidad"
      />
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export function UnavailableStep({
  onChooseAgain,
  onLeave,
  message = BLOCKED_COUNTRY_MESSAGE,
  chooseAgainLabel = "Elegir otro país",
}: {
  onChooseAgain: () => void;
  onLeave: () => void;
  message?: string;
  chooseAgainLabel?: string;
}) {
  return (
    <div className="mt-4">
      <p className="max-w-[60ch] text-sm leading-relaxed text-pretty text-fg-body">{message}</p>
      <div className="mt-6 flex flex-col gap-1">
        <Button type="button" size="lg" className="w-full" onClick={onChooseAgain}>
          {chooseAgainLabel}
        </Button>
        <Button type="button" variant="ghost" size="md" className="w-full" onClick={onLeave}>
          Entendido
        </Button>
      </div>
    </div>
  );
}

export function DeclarationStep({
  value,
  onChange,
  onBlur,
  inputRef,
  error,
  onDeclareYes,
}: {
  /** DB-03: `null` = sin responder. No hay opción marcada por defecto. */
  value: UsPersonDeclaration | null;
  onChange: (value: UsPersonDeclaration) => void;
  onBlur: () => void;
  inputRef: (element: HTMLInputElement | null) => void;
  error?: string;
  onDeclareYes: () => void;
}) {
  const id = useId();
  const legendId = `${id}-legend`;
  const errorId = `${id}-error`;
  const described = error ? errorId : undefined;
  return (
    <fieldset
      className="mt-5"
      role="radiogroup"
      aria-labelledby={legendId}
      aria-invalid={error ? true : undefined}
      aria-describedby={described}
    >
      <legend id={legendId} className="text-[13px] font-medium text-fg">
        {US_PERSON_QUESTION}
      </legend>
      <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-pretty text-fg-muted">
        Para usar {site.name} tienes que declarar que no eres persona de un país restringido. Si lo eres, la cuenta no
        está disponible. [REVISIÓN ABOGADO]
      </p>
      <div className="mt-3 divide-y divide-border border-y border-border">
        <label htmlFor={`${id}-no`} className="flex min-h-11 cursor-pointer items-start gap-3 py-3">
          <input
            ref={inputRef}
            id={`${id}-no`}
            type="radio"
            name={id}
            value="no"
            checked={value === "no"}
            onChange={() => onChange("no")}
            onBlur={onBlur}
            className="mt-0.5 size-5 shrink-0 accent-fg"
          />
          <span className="text-sm leading-relaxed text-fg">{US_PERSON_DECLARATION_TEXT}</span>
        </label>
        <label htmlFor={`${id}-yes`} className="flex min-h-11 cursor-pointer items-start gap-3 py-3">
          <input
            id={`${id}-yes`}
            type="radio"
            name={id}
            value="yes"
            checked={value === "yes"}
            onChange={() => {
              onChange("yes");
              onDeclareYes();
            }}
            onBlur={onBlur}
            className="mt-0.5 size-5 shrink-0 accent-fg"
          />
          <span className="text-sm leading-relaxed text-fg">{US_PERSON_YES_LABEL}</span>
        </label>
      </div>
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}

function DocAccept({
  doc,
  version,
  checked,
  onChange,
  onBlur,
  inputRef,
  error,
}: {
  doc: keyof typeof DOC_LINKS;
  version: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  onBlur: () => void;
  inputRef: (element: HTMLInputElement | null) => void;
  error?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const link = DOC_LINKS[doc];
  return (
    <div>
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
        <input
          ref={inputRef}
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          onBlur={onBlur}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="mt-0.5 size-5 shrink-0 accent-fg"
        />
        <span className="text-sm leading-relaxed text-fg">
          Acepto la versión {version} de{" "}
          <Link
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline decoration-border underline-offset-4 hover:decoration-fg"
          >
            {link.name}
          </Link>
          .
        </span>
      </label>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export function DocumentsStep({
  control,
  versions,
  onReject,
}: {
  control: OnboardingControl;
  versions: LegalVersions;
  onReject: () => void;
}) {
  const docs = ["terminos", "privacidad", "riesgos"] as const;
  return (
    <div className="mt-5">
      <p className="max-w-[60ch] text-sm leading-relaxed text-pretty text-fg-body">
        Resumen de riesgos. El texto completo está en cada documento. Al continuar queda registrada la versión que
        aceptas.
      </p>
      <ul className="mt-4 space-y-2 border-l-2 border-border pl-4 text-sm leading-relaxed text-fg-body">
        {RISK_POINTS.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <div className="mt-5 divide-y divide-border border-y border-border">
        {docs.map((doc) => (
          <div key={doc} className="py-3">
            <Controller
              name={doc}
              control={control}
              render={({ field, fieldState }) => (
                <DocAccept
                  doc={doc}
                  version={versions[doc]}
                  checked={field.value}
                  onChange={(checked) => {
                    field.onChange(checked);
                    if (!checked) onReject();
                  }}
                  onBlur={field.onBlur}
                  inputRef={field.ref}
                  error={fieldState.error?.message}
                />
              )}
            />
          </div>
        ))}
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-fg-muted">Borrador. [REVISIÓN ABOGADO]</p>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="size-4 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function shortAddress(address: string): string {
  const trimmed = address.trim();
  if (trimmed.length <= 11) return trimmed;
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

export function WalletStep({
  phase,
  address,
  onRetry,
}: {
  phase: "creating" | "ready" | "error";
  address: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="mt-5" aria-live="polite">
      {phase === "creating" ? (
        <p className="flex min-h-11 items-center gap-2 text-[13px] text-fg-muted">
          <Spinner />
          Creando tu billetera…
        </p>
      ) : null}
      {phase === "ready" && address ? (
        <div>
          <p className="text-sm font-medium text-fg">Billetera lista</p>
          <dl className="mt-3 divide-y divide-border border-y border-border text-sm">
            <div className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-fg-muted">Dirección</dt>
              <dd className="num min-w-0 truncate text-fg" aria-label={`Dirección ${address}`}>
                {shortAddress(address)}
              </dd>
            </div>
          </dl>
          <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-pretty text-fg-body">
            Queda asociada a tu cuenta. Lo que compres queda en esta billetera.
          </p>
        </div>
      ) : null}
      {phase === "error" ? (
        <div>
          <p className="text-sm leading-relaxed text-down" role="alert">
            No apareció la billetera. Reinténtalo.
          </p>
          <div className="mt-4">
            <Button type="button" variant="secondary" size="lg" className="w-full" onClick={onRetry}>
              Reintentar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Cierre del onboarding: el resumen va en filas label/valor con hairline, no
 * en tarjetas. Un solo CTA primario; el resto es secundario.
 */
export function DoneStep({
  busyHref,
  onDeposit,
  onExplore,
  summary = [],
}: {
  busyHref: string | null;
  onDeposit: () => void;
  onExplore: () => void;
  summary?: { label: string; value: string }[];
}) {
  const busy = busyHref !== null;
  return (
    <div className="mt-5">
      <p className="max-w-[60ch] text-sm leading-relaxed text-pretty text-fg-body">
        {PESO_DEPOSITS_ENABLED
          ? "Tu registro quedó guardado. Puedes depositar pesos o explorar las acciones."
          : "Tu registro quedó guardado. Puedes explorar las acciones."}
      </p>
      {summary.length ? (
        <dl className="mt-4 divide-y divide-border border-y border-border text-sm">
          {summary.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="shrink-0 text-fg-muted">{row.label}</dt>
              <dd className="min-w-0 text-right font-medium break-words text-fg">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="mt-6 flex flex-col gap-2">
        {/* Primera versión: sólo USDC por Solana. El acceso en pesos queda oculto, no borrado. */}
        {PESO_DEPOSITS_ENABLED ? (
          <Button
            type="button"
            size="lg"
            className="w-full"
            loading={busyHref === "/app/billetera/depositar"}
            disabled={busy}
            onClick={onDeposit}
          >
            Depositar pesos
          </Button>
        ) : null}
        <Button
          type="button"
          variant={PESO_DEPOSITS_ENABLED ? "secondary" : "primary"}
          size="lg"
          className="w-full"
          loading={busyHref === "/app"}
          disabled={busy}
          onClick={onExplore}
        >
          Explorar acciones
        </Button>
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-fg-muted">
        Las acciones tokenizadas no otorgan derechos de accionista. Invertir implica riesgos.
      </p>
    </div>
  );
}
