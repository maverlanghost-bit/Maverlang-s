import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthCard } from "@/components/auth/auth-frame";
import { AuthShell } from "@/components/auth/auth-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { site } from "@/config/site";

import { RecuperarForm } from "./recuperar-form";

export const metadata: Metadata = {
  title: "Recuperar contraseña",
  description: `Recupera el acceso a tu cuenta en ${site.name}.`,
  robots: { index: false, follow: false },
};

function Fallback() {
  return (
    <AuthCard aria-busy="true">
      <span className="sr-only" role="status">
        Cargando la recuperación
      </span>
      <Skeleton className="mt-2 h-3 w-24" />
      <Skeleton className="mt-4 h-8 w-3/4" />
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-6 h-11 w-full" />
      <Skeleton className="mt-5 h-11 w-full" />
    </AuthCard>
  );
}

export default function RecuperarPage() {
  return (
    <AuthShell>
      <Suspense fallback={<Fallback />}>
        <RecuperarForm />
      </Suspense>
    </AuthShell>
  );
}
