import type { Metadata } from "next";

import { site } from "@/config/site";
import { safeNextPath } from "@/lib/auth/paths";
import { serverEnv } from "@/lib/env";

import { OnboardingWizard } from "./wizard";

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export const metadata: Metadata = {
  title: "Registro",
  description: `Registro de residencia y documentos en ${site.name}.`,
  robots: { index: false, follow: false },
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = safeNextPath(one(params.next));

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <OnboardingWizard
        terminosVersion={serverEnv.TERMS_VERSION}
        privacidadVersion={serverEnv.PRIVACY_VERSION}
        riesgosVersion={serverEnv.RISKS_VERSION}
        returnTo={returnTo}
      />
    </main>
  );
}
