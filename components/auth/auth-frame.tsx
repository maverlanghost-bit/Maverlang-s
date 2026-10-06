"use client";

import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";

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
      <Link href="/" className="flex w-fit items-center gap-2 rounded-full text-fg">
        <span className="size-2 shrink-0 rounded-full bg-brand" aria-hidden />
        <span className="text-sm font-medium">{site.name}</span>
      </Link>
      <h1 className="mt-6 text-3xl text-balance">{title}</h1>
      {lead ? <p className="mt-3 text-sm leading-relaxed text-fg-body">{lead}</p> : null}
      {children}
    </Card>
  );
}

export function CredentialField({
  id,
  label,
  error,
  ...props
}: { id: string; label: string; error?: string } & ComponentProps<"input">) {
  const errorId = `${id}-error`;
  return (
    <div className="mt-4">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      <Input
        id={id}
        className="mt-2"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...props}
      />
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
        className="font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
      >
        Términos y condiciones
      </Link>{" "}
      y la{" "}
      <Link
        href="/legal/privacidad"
        className="font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
      >
        Política de privacidad
      </Link>
      .
    </p>
  );
}
