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
      <Link href="/" aria-label={site.name} className="flex w-fit items-center rounded-sm text-fg outline-none focus-visible:ring-4 focus-visible:ring-fg/20">
        <BrandLogoImage />
      </Link>
      <div className="mt-5 inline-flex w-fit items-center gap-2 rounded-full border border-brand/25 bg-brand-soft/40 px-3 py-1 text-xs font-medium text-fg">
        <span className="size-1.5 rounded-full bg-up" aria-hidden="true" />
        <span>Conexión cifrada · Autocustodia en Solana</span>
      </div>
      <h1 className="mt-6 text-3xl text-balance">{title}</h1>
      {lead ? <p className="mt-3 text-sm leading-relaxed text-fg-body">{lead}</p> : null}
      {children}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2 border-t border-border/60 pt-4 text-[11px] text-fg-muted">
        <span>Respaldo 1:1 xStocks</span>
        <span>·</span>
        <span>0% comisión</span>
        <span>·</span>
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
      <label htmlFor={id} className="text-sm font-medium text-fg">
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
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
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
        <p id={errorId} className="mt-2 text-sm text-down" role="alert">
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
        className="rounded-sm font-medium text-fg underline decoration-border underline-offset-4 outline-none hover:decoration-fg focus-visible:ring-4 focus-visible:ring-fg/20"
      >
        Términos y condiciones
      </Link>{" "}
      y la{" "}
      <Link
        href="/legal/privacidad"
        className="rounded-sm font-medium text-fg underline decoration-border underline-offset-4 outline-none hover:decoration-fg focus-visible:ring-4 focus-visible:ring-fg/20"
      >
        Política de privacidad
      </Link>
      .
    </p>
  );
}
