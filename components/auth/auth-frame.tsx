"use client";

import { useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { BrandLogoImage } from "@/components/app-shell/brand-image";

import { site } from "@/config/site";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function AuthFrame({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <Card className="w-full max-w-md">
      <Link href="/" aria-label={site.name} className="flex min-h-11 w-fit items-center rounded-sm text-fg">
        <BrandLogoImage />
      </Link>
      <div className="mt-4 inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-bg px-3 py-1.5 text-xs font-medium leading-snug text-fg-muted">
        <span className="size-1.5 shrink-0 rounded-full bg-up" aria-hidden="true" />
        <span>Conexión cifrada · Autocustodia en Solana</span>
      </div>
      <h1 className="mt-5 text-[1.75rem] leading-[1.15] text-balance sm:text-3xl">{title}</h1>
      {lead ? <p className="mt-3 text-sm leading-relaxed text-fg-muted">{lead}</p> : null}
      {children}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-border pt-4 text-xs text-fg-muted">
        <span>Respaldo 1:1 xStocks</span>
        <span aria-hidden="true">·</span>
        <span>0% comisión</span>
        <span aria-hidden="true">·</span>
        <span>24/7 Solana SPL</span>
      </div>
    </Card>
  );
}

export function CredentialField({
  id,
  label,
  error,
  type,
  ...props
}: { id: string; label: string; error?: string } & ComponentProps<"input">) {
  const errorId = `${id}-error`;
  const [visible, setVisible] = useState(false);
  return (
    <div className="mt-4">
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
      </label>
      {type === "password" ? (
        <div className="relative mt-2">
          <Input
            id={id}
            type={visible ? "text" : "password"}
            className="pr-20"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-controls={id}
            className="absolute inset-y-0 right-0 flex min-w-11 items-center justify-center rounded-r-md px-3 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
          >
            {visible ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      ) : (
        <Input
          id={id}
          type={type}
          className="mt-2"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...props}
        />
      )}
      {error ? (
        <p id={errorId} className="mt-2 break-words text-sm leading-relaxed text-down" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AuthLegal() {
  return (
    <p className="mt-6 text-center text-sm leading-relaxed text-fg-muted">
      Al continuar aceptas los{" "}
      <Link
        href="/legal/terminos"
        className="rounded-sm font-medium text-fg underline decoration-border underline-offset-4 transition-colors hover:decoration-fg"
      >
        Términos y condiciones
      </Link>{" "}
      y la{" "}
      <Link
        href="/legal/privacidad"
        className="rounded-sm font-medium text-fg underline decoration-border underline-offset-4 transition-colors hover:decoration-fg"
      >
        Política de privacidad
      </Link>
      .
    </p>
  );
}
