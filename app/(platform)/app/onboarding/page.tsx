import type { Metadata } from "next";

import { site } from "@/config/site";
import { serverEnv } from "@/lib/env";

import { OnboardingWizard } from "./wizard";

export const metadata: Metadata = {
  title: "Registro",
  description: `Registro de residencia y documentos en ${site.name}.`,
  robots: { index: false, follow: false },
};

export default function OnboardingPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <OnboardingWizard
        terminosVersion={serverEnv.TERMS_VERSION}
        privacidadVersion={serverEnv.PRIVACY_VERSION}
        riesgosVersion={serverEnv.RISKS_VERSION}
      />
    </main>
  );
}
