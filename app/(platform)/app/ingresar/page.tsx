import type { Metadata } from "next";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { site } from "@/config/site";

import { LoginCard } from "./login-card";

export const metadata: Metadata = {
  title: "Ingresar",
  description: `Ingresa o crea tu cuenta en ${site.name}.`,
  robots: { index: false, follow: false },
};

function LoginFallback() {
  return (
    <Card className="w-full max-w-md shadow-float" aria-hidden>
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-brand" />
        <span className="text-sm font-medium text-fg">{site.name}</span>
      </div>
      <h1 className="mt-6 text-3xl">Ingresa o crea tu cuenta</h1>
    </Card>
  );
}

export default function IngresarPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <Suspense fallback={<LoginFallback />}>
        <LoginCard />
      </Suspense>
    </main>
  );
}
