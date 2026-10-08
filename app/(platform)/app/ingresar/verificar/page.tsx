import type { Metadata } from "next";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { site } from "@/config/site";

import { MfaVerifyForm } from "./form";

export const metadata: Metadata = {
  title: "Verificar",
  description: `Verificación en dos pasos de ${site.name}.`,
  robots: { index: false, follow: false },
};

function VerificarFallback() {
  return (
    <Card className="w-full max-w-md" aria-hidden>
      <h1 className="mt-6 text-3xl">Verificación en dos pasos</h1>
    </Card>
  );
}

export default function VerificarPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <Suspense fallback={<VerificarFallback />}>
        <MfaVerifyForm />
      </Suspense>
    </main>
  );
}
