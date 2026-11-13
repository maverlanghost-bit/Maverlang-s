import type { Metadata } from "next";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { site } from "@/config/site";

import { RestablecerForm } from "./restablecer-form";

export const metadata: Metadata = {
  title: "Nueva contraseña",
  description: `Elige una contraseña nueva en ${site.name}.`,
  robots: { index: false, follow: false },
};

function Fallback() {
  return (
    <Card className="w-full max-w-md" aria-busy="true">
      <span className="sr-only" role="status">
        Cargando el formulario
      </span>
      <div className="flex min-h-11 items-center">
        <Skeleton className="h-5 w-32" />
      </div>
      <Skeleton className="mt-5 h-8 w-3/4" />
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-6 h-11 w-full" />
      <Skeleton className="mt-4 h-11 w-full" />
      <Skeleton className="mt-6 h-11 w-full rounded-full" />
    </Card>
  );
}

export default function RestablecerPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-start px-5 py-8 sm:justify-center sm:py-12">
      <Suspense fallback={<Fallback />}>
        <RestablecerForm />
      </Suspense>
    </main>
  );
}
