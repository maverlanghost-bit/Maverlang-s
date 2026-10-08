import type { Metadata } from "next";

import { site } from "@/config/site";
import { isSupabaseAuth } from "@/lib/auth/mode";
import { safeNextPath } from "@/lib/auth/paths";
import { serverEnv } from "@/lib/env";

import { RegistroWizard } from "../registro/wizard";
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

  const versions = {
    terminos: serverEnv.TERMS_VERSION,
    privacidad: serverEnv.PRIVACY_VERSION,
    riesgos: serverEnv.RISKS_VERSION,
    usPersonDeclarationVersion: serverEnv.US_PERSON_DECLARATION_VERSION,
  };

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      {isSupabaseAuth() ? (
        <RegistroWizard
          mode="completar"
          next={returnTo}
          versions={versions}
          declarationVersion={serverEnv.US_PERSON_DECLARATION_VERSION}
          demoForBlocked={serverEnv.DEMO_FOR_BLOCKED}
        />
      ) : (
        <OnboardingWizard
          terminosVersion={versions.terminos}
          privacidadVersion={versions.privacidad}
          riesgosVersion={versions.riesgos}
          returnTo={returnTo}
          declarationVersion={serverEnv.US_PERSON_DECLARATION_VERSION}
          demoForBlocked={serverEnv.DEMO_FOR_BLOCKED}
        />
      )}
    </main>
  );
}
