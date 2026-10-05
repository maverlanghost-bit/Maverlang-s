import type { Metadata } from "next";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { site } from "@/config/site";

import { LogoutButton } from "./logout-button";

export const metadata: Metadata = {
  title: "Registro",
  robots: { index: false, follow: false },
};

export default function OnboardingPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <Card className="w-full max-w-md shadow-float">
        <Link href="/" className="flex w-fit items-center gap-2 rounded-full text-fg">
          <span className="size-2 shrink-0 rounded-full bg-brand" aria-hidden />
          <span className="text-sm font-medium">{site.name}</span>
        </Link>
        <p className="label mt-6">Registro</p>
        <h1 className="mt-3 text-3xl text-balance">Antes de usar el mercado</h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-body">
          Tu sesión ya está activa. Falta el registro de residencia y la aceptación de los documentos. Esos pasos
          todavía no están en esta pantalla.
        </p>
        <div className="mt-6">
          <LogoutButton />
        </div>
      </Card>
    </main>
  );
}
