import type { Metadata } from "next";

import { site } from "@/config/site";
import { safeNextPath } from "@/lib/auth/paths";
import { serverEnv } from "@/lib/env";

import { AceptarForm } from "./aceptar-form";

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export const metadata: Metadata = {
  title: "Acepta los documentos",
  description: `Acepta los documentos de ${site.name} para usar la demo.`,
  robots: { index: false, follow: false },
};

export default async function AceptarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(one(params.next));

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <AceptarForm
        next={next}
        terminosVersion={serverEnv.TERMS_VERSION}
        privacidadVersion={serverEnv.PRIVACY_VERSION}
      />
    </main>
  );
}
