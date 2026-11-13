import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthCard } from "@/components/auth/auth-frame";
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
    <AuthCard aria-busy="true">
      <span className="sr-only" role="status">
        Cargando el formulario
      </span>
      <Skeleton className="mt-2 h-3 w-24" />
      <Skeleton className="mt-4 h-8 w-3/4" />
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-6 h-11 w-full" />
      <Skeleton className="mt-5 h-11 w-full" />
    </AuthCard>
  );
}

export default function RestablecerPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center px-4 py-8 sm:px-5 sm:py-12">
      <Suspense fallback={<Fallback />}>
        <RestablecerForm />
      </Suspense>
    </main>
  );
}
