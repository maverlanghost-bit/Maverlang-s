"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import { Controller, type Control } from "react-hook-form";

import { site } from "@/config/site";
import { Button } from "@/components/ui/button";
import { Select, type SelectOption } from "@/components/ui/select";
import type { LegalVersions, OnboardingStep } from "./draft";
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

export function BrandLink() {
  return (
    <Link href="/" className="flex w-fit items-center gap-2 rounded-full text-fg">
      <span className="size-2 shrink-0 rounded-full bg-brand" aria-hidden />
      <span className="text-sm font-medium">{site.name}</span>
    </Link>
  );
}

export function StepProgress({ step }: { step: OnboardingStep }) {
  return (
    <div className="mt-6">
      <p className="label">Paso {step} de 5</p>
      <div
        className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={5}
        aria-valuenow={step}
        aria-valuetext={`Paso ${step} de 5`}
      >
        <div
          className="h-full rounded-full bg-fg transition-[width] duration-[240ms] ease-[cubic-bezier(0.25,1,0.5,1)]"
          style={{ width: `${(step / 5) * 100}%` }}
        />
      </div>
    </div>
  );
}

export function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-2 text-sm text-down" role="alert">
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
      <div className="flex min-h-11 items-start gap-3">
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
        <label htmlFor={id} className="cursor-pointer text-sm leading-relaxed text-fg">
          {label}
        </label>
      </div>
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
    <div className="mt-4">
      <p className="text-sm leading-relaxed text-fg-body">
        Elige el país donde resides. Si es Estados Unidos, la cuenta no está disponible.
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

export function UnavailableStep({ onChooseAgain }: { onChooseAgain: () => void }) {
  return (
    <div className="mt-4">
      <p className="text-sm leading-relaxed text-fg-body">
        {site.name} no está disponible para residentes de Estados Unidos. Si vives en otro país, elige ese país.
      </p>
      <div className="mt-6">
        <Button type="button" size="lg" className="w-full" onClick={onChooseAgain}>
          Elegir otro país
        </Button>
      </div>
    </div>
  );
}

export function DeclarationStep({
  checked,
  onChange,
  onBlur,
  inputRef,
  error,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  onBlur: () => void;
  inputRef: (element: HTMLInputElement | null) => void;
  error?: string;
}) {
  return (
    <div className="mt-4 flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-fg-body">
        Para usar {site.name} tienes que declarar que no eres ciudadano ni residente de Estados Unidos. Si lo eres, el
        servicio no está disponible.
      </p>
      <CheckField
        checked={checked}
        onChange={onChange}
        onBlur={onBlur}
        inputRef={inputRef}
        error={error}
        label="No soy ciudadano ni residente de EE.UU. (US person)"
      />
    </div>
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
      <div className="flex min-h-11 items-start gap-3">
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
        <p className="text-sm leading-relaxed text-fg">
          <label htmlFor={id} className="cursor-pointer">
            Acepto la versión {version} de{" "}
          </label>
          <Link
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline decoration-border underline-offset-4 hover:decoration-fg"
          >
            {link.name}
          </Link>
          .
        </p>
      </div>
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
    <div className="mt-4 flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-fg-body">
        Resumen de riesgos. El texto completo está en cada documento. Al continuar queda registrada la versión que
        aceptas.
      </p>
      <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-fg-body">
        {RISK_POINTS.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <div className="flex flex-col gap-3">
        {docs.map((doc) => (
          <Controller
            key={doc}
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
        ))}
      </div>
      <p className="text-xs leading-relaxed text-fg-muted">Borrador. [REVISIÓN ABOGADO]</p>
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
    <div className="mt-4" aria-live="polite">
      {phase === "creating" ? (
        <p className="flex min-h-11 items-center gap-2 text-sm text-fg">
          <Spinner />
          Creando tu billetera…
        </p>
      ) : null}
      {phase === "ready" && address ? (
        <div>
          <p className="text-sm font-medium text-up">Lista</p>
          <p className="num mt-3 text-sm text-fg" aria-label={`Dirección ${address}`}>
            {shortAddress(address)}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-fg-body">
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

export function DoneStep({
  busyHref,
  onDeposit,
  onExplore,
}: {
  busyHref: string | null;
  onDeposit: () => void;
  onExplore: () => void;
}) {
  const busy = busyHref !== null;
  return (
    <div className="mt-4">
      <p className="text-sm leading-relaxed text-fg-body">
        Tu registro quedó guardado. Puedes depositar pesos o explorar las acciones.
      </p>
      <div className="mt-6 flex flex-col gap-3">
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
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="w-full"
          loading={busyHref === "/app"}
          disabled={busy}
          onClick={onExplore}
        >
          Explorar acciones
        </Button>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-fg-muted">
        Las acciones tokenizadas no otorgan derechos de accionista. Invertir implica riesgos.
      </p>
    </div>
  );
}
