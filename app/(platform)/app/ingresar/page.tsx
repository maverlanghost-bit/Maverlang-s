import type { Metadata } from "next";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
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
    <Card className="my-auto w-full max-w-md" aria-busy="true">
      <span className="sr-only" role="status">
        Cargando el ingreso
      </span>
      <div className="flex min-h-11 items-center">
        <Skeleton className="h-5 w-32" />
      </div>
      <Skeleton className="mt-4 h-7 w-64 max-w-full rounded-full" />
      <Skeleton className="mt-5 h-8 w-4/5" />
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-6 h-11 w-full rounded-full" />
      <Skeleton className="mt-3 h-11 w-full rounded-full" />
    </Card>
  );
}

export default function IngresarPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center px-5 py-8 sm:py-12">
      <Suspense fallback={<LoginFallback />}>
        <LoginCard />
      </Suspense>
    </main>
  );
}
