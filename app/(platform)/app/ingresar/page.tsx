import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthCard } from "@/components/auth/auth-frame";
import { AuthShell } from "@/components/auth/auth-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { site } from "@/config/site";

import { LoginCard } from "./login-card";

export const metadata: Metadata = {
  title: "Ingresar",
  description: `Ingresa o crea tu cuenta en ${site.name}.`,
  robots: { index: false, follow: false },
};

function LoginFallback() {
  return (
    <AuthCard aria-busy="true">
      <span className="sr-only" role="status">
        Cargando el ingreso
      </span>
      <Skeleton className="mt-2 h-3 w-24" />
      <Skeleton className="mt-4 h-8 w-4/5" />
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-6 h-11 w-full" />
      <Skeleton className="mt-2 h-11 w-full" />
    </AuthCard>
  );
}

export default function IngresarPage() {
  return (
    <AuthShell>
      <Suspense fallback={<LoginFallback />}>
        <LoginCard />
      </Suspense>
    </AuthShell>
  );
}
