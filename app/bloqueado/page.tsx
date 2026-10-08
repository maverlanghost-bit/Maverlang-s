import type { Metadata } from "next";
import Link from "next/link";
import { complianceM75Es } from "@/content/i18n/es-CL";
import { site } from "@/config/site";

// M48: sin `force-static`: la CSP con nonce exige render dinámico.

export const metadata: Metadata = {
  title: "Región no disponible",
  description: `${site.name} no está disponible en esta región.`,
  robots: { index: false, follow: false },
};

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function BloqueadoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const residence = one(params.motivo) === "residencia";
  const title = residence ? complianceM75Es.residenceTitle : complianceM75Es.locationTitle;
  const body = residence ? complianceM75Es.residenceBody : complianceM75Es.locationBody;

  return (
    <main className="flex min-h-dvh flex-col px-5 py-10">
      <Link href="/" className="flex w-fit items-center gap-2 rounded-full text-fg">
        <span className="size-2 shrink-0 rounded-full bg-brand" aria-hidden />
        <span className="text-sm font-medium">{site.name}</span>
      </Link>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-16">
        <p className="label">{residence ? "Cuenta" : "Ubicación"}</p>
        <h1 className="mt-3 text-4xl text-balance sm:text-5xl">{title}</h1>
        <p className="mt-4 text-sm leading-relaxed text-fg-body sm:text-base">{body}</p>
        <p className="mt-8">
          <Link
            href="/ayuda"
            className="inline-flex min-h-11 items-center text-sm font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
          >
            Centro de ayuda
          </Link>
        </p>
      </div>
    </main>
  );
}
