"use client";

import { useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { BrandLogoImage } from "@/components/app-shell/brand-image";

import { site } from "@/config/site";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

/**
 * Escala única de título para acceso y onboarding: 28 px en móvil (cabe en
 * 360 px sin partir palabras) y 30 px desde sm. Sin margen: cada pantalla
 * decide la separación respecto de lo que tiene arriba.
 */
export const authTitleClass =
  "text-[1.75rem] leading-[1.15] tracking-tight text-balance text-fg outline-none sm:text-3xl";

/** Entradilla: una sola línea de contexto, medida de lectura corta. */
export const authLeadClass = "mt-2 max-w-[60ch] text-sm leading-relaxed text-pretty text-fg-muted";

/**
 * Enlace secundario de la familia: ghost de verdad (sin relleno ni borde), con
 * área táctil de 44 px y subrayado visible. 13 px es el mínimo del sistema.
 */
export const authLinkClass =
  "inline-flex min-h-11 items-center rounded-sm px-1.5 text-[13px] font-medium text-fg underline decoration-border underline-offset-4 transition-colors hover:decoration-fg";

/**
 * Cáscara única de las pantallas de acceso: hoja blanca con un solo hairline,
 * sin sombras y sin tarjetas anidadas. El logo es el mismo asset del header.
 */
export function AuthCard({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <Card className={cn("my-auto w-full max-w-md bg-bg p-5 sm:p-6 md:p-8", className)} {...props}>
      <Link href="/" aria-label={site.name} className="inline-flex min-h-11 items-center rounded-sm">
        <BrandLogoImage />
      </Link>
      {children}
    </Card>
  );
}

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
    <AuthCard>
      <p className="mt-2 text-xs leading-snug text-fg-muted">Conexión cifrada · Autocustodia en Solana</p>
      <h1 className={cn("mt-3", authTitleClass)}>{title}</h1>
      {lead ? <p className={authLeadClass}>{lead}</p> : null}
      {children}
      <div className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-4 text-xs leading-snug text-fg-muted">
        <span>Respaldo 1:1 xStocks</span>
        <span aria-hidden="true">·</span>
        <span>0% comisión</span>
        <span aria-hidden="true">·</span>
        <span>24/7 Solana SPL</span>
      </div>
    </AuthCard>
  );
}

/**
 * Campo con etiqueta arriba, control de 44 px y un solo mensaje debajo: el
 * error reemplaza al hint, así el formulario no gana una línea extra cuando
 * falla la validación.
 */
export function CredentialField({
  id,
  label,
  error,
  hint,
  type,
  className,
  ...props
}: { id: string; label: string; error?: string; hint?: string } & ComponentProps<"input">) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const described = error ? errorId : hint ? hintId : undefined;
  const [visible, setVisible] = useState(false);

  return (
    <div className="mt-5">
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
      </label>
      {type === "password" ? (
        <div className="relative mt-2">
          <Input
            id={id}
            type={visible ? "text" : "password"}
            className={cn("pr-[4.75rem]", className)}
            aria-invalid={error ? true : undefined}
            aria-describedby={described}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-controls={id}
            className="absolute inset-y-0 right-0 flex min-w-11 items-center justify-center rounded-r-md px-3 text-[13px] font-medium text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
          >
            {visible ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      ) : (
        <Input
          id={id}
          type={type}
          className={cn("mt-2", className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          {...props}
        />
      )}
      {error ? (
        <p id={errorId} className="mt-1.5 text-[13px] leading-snug text-pretty text-down" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-[13px] leading-snug text-pretty text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function AuthLegal() {
  return (
    <p className="mt-5 max-w-[60ch] text-[13px] leading-relaxed text-pretty text-fg-muted">
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
