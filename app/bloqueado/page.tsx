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
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center py-16">
        <div className="rounded-3xl border border-border/80 bg-white p-6 shadow-float sm:p-10">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border/70 bg-surface-1 px-2.5 py-0.5 text-[11px] font-medium text-fg-muted">
            Cumplimiento Normativo · Restricción Jurisdiccional
          </span>
          <p className="label mt-4">{residence ? "Cuenta" : "Ubicación"}</p>
          <h1 className="mt-3 text-4xl text-balance sm:text-5xl">{title}</h1>
          <p className="mt-4 text-sm leading-relaxed text-fg-body sm:text-base">{body}</p>
          <div className="mt-6 grid gap-3 text-xs text-fg-muted sm:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-surface-1/70 px-3 py-2.5">
              <p className="font-medium text-fg">Normativa internacional</p>
              <p className="mt-0.5 leading-relaxed">
                Restricciones de acceso por residencia y jurisdicción, revisadas con criterio de
                cumplimiento.
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-surface-1/70 px-3 py-2.5">
              <p className="font-medium text-fg">Protección de cuentas</p>
              <p className="mt-0.5 leading-relaxed">
                Si tienes saldo o posiciones, tus activos permanecen en tu billetera autocustodiada.
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-surface-1/70 px-3 py-2.5">
              <p className="font-medium text-fg">Soporte y consultas</p>
              <p className="mt-0.5 leading-relaxed">
                Escríbenos desde el Centro de ayuda para revisar tu caso.
              </p>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link
              href="/ayuda"
              className="inline-flex min-h-11 items-center text-sm font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
            >
              Centro de ayuda
            </Link>
            <Link
              href="/legal/terminos"
              className="inline-flex min-h-11 items-center text-sm font-medium text-fg-muted underline decoration-border underline-offset-4 hover:text-fg hover:decoration-fg"
            >
              Términos y condiciones
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
