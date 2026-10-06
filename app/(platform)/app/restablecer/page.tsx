import type { Metadata } from "next";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { site } from "@/config/site";

import { RestablecerForm } from "./restablecer-form";

export const metadata: Metadata = {
  title: "Nueva contraseña",
  description: `Elige una contraseña nueva en ${site.name}.`,
  robots: { index: false, follow: false },
};

function Fallback() {
  return (
    <Card className="w-full max-w-md" aria-hidden>
      <span className="text-sm font-medium text-fg">{site.name}</span>
      <h1 className="mt-6 text-3xl">Nueva contraseña</h1>
    </Card>
  );
}

export default function RestablecerPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <Suspense fallback={<Fallback />}>
        <RestablecerForm />
      </Suspense>
    </main>
  );
}
