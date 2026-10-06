import type { Metadata } from "next";

import { site } from "@/config/site";
import { safeNextPath } from "@/lib/auth/paths";
import { serverEnv } from "@/lib/env";

import { RegistroWizard } from "./wizard";

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export const metadata: Metadata = {
  title: "Crear cuenta",
  description: `Crea tu cuenta en ${site.name}.`,
  robots: { index: false, follow: false },
};

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(one(params.next));

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <RegistroWizard
        mode="alta"
        next={next}
        versions={{
          terminos: serverEnv.TERMS_VERSION,
          privacidad: serverEnv.PRIVACY_VERSION,
          riesgos: serverEnv.RISKS_VERSION,
        }}
      />
    </main>
  );
}
