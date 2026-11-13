"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { site } from "@/config/site";

/** Check esmeralda: mismo trazo que el resto de los íconos de la app. */
function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="size-3"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="m3.6 8.4 2.9 2.9 5.9-6.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ControlRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-surface-2/50 px-3 py-2.5">
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-up-bg text-up"
      >
        <CheckIcon />
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-medium leading-4 tracking-tight text-fg-muted">{label}</dt>
        <dd className="mt-0.5 text-balance text-sm leading-5 break-words text-fg">{value}</dd>
      </div>
    </div>
  );
}

/**
 * Resumen de confianza de la cuenta: identidad de acceso, custodia, límites de
 * retiro y modo de operación. Sólo informa; no expone datos sensibles más allá
 * del correo de la sesión ni calcula cupos consumidos.
 */
export function SecurityShieldCard({
  email,
  mode,
}: {
  email: string | null | undefined;
  mode: "demo" | "real";
}) {
  const controls = [
    {
      label: "Identidad de acceso",
      value: email ? `Sesión activa (${email})` : "Sesión de prueba",
    },
    {
      label: "Modelo de custodia",
      value: `Autocustodia Solana SPL (${site.name} nunca retiene tus llaves)`,
    },
    {
      label: "Límites de seguridad de retiro",
      value: "US$500 por operación/día · US$2.000 cada 30 días",
    },
    {
      label: "Modo de operación actual",
      value: mode === "real" ? "Cuenta Real" : "Cuenta Demo (US$10.000 virtuales)",
    },
  ] as const;

  return (
    <Card className="flex flex-col gap-4 p-5 md:p-6" data-security-shield={mode}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-medium tracking-tight text-fg">
            Centro de Confianza y Protección
          </h2>
          <p className="mt-1 text-balance text-sm leading-5 text-fg-muted">
            Revisa qué protege a tu cuenta y cómo está configurada hoy.
          </p>
        </div>
        <Badge tone="up">Protección activa</Badge>
      </div>

      <dl className="flex flex-col gap-2">
        {controls.map((control) => (
          <ControlRow key={control.label} label={control.label} value={control.value} />
        ))}
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
        <p className="flex items-center gap-2 text-xs leading-5 text-fg-muted">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-up ring-2 ring-up-bg" />
          Sistemas operativos · Solana Mainnet 24/7
        </p>
        <Link
          href="/app/perfil/seguridad"
          className="inline-flex min-h-11 items-center rounded-md text-[13px] leading-5 font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Configurar seguridad y 2FA →
        </Link>
      </div>
    </Card>
  );
}
