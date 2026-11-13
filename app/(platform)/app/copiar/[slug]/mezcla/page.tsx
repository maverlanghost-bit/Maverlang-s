import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { COVERAGE_COPY_MIN } from "@/components/copy/coverage";
import { CopySoonState } from "@/components/copy/empty-states";
import { ExampleDataStrip, FeedBanner } from "@/components/copy/feed-banner";
import { FraccionSeal } from "@/components/copy/fraccion-seal";
import { MixCart } from "@/components/copy/mix-cart";
import { Paywall } from "@/components/copy/paywall";
import { IconBack } from "@/components/ui/icons";
import { COPY_DISCLAIMER, COPY_LEGAL_PENDING_LABEL } from "@/content/copy-legal";
import { COPY_PAST_DUE_MESSAGE, getCopyEntitlement, hasCopyAccess } from "@/lib/copy/access";
import { getCopyIndex, getCopyPortfolio, isCopyFrozenByFeed } from "@/lib/copy/feed";
import { isCopyEnabled, isCopyRealBuyEnabled } from "@/lib/copy/flags";
import { coverageOf, mapPositions } from "@/lib/copy/mapping";
import { canonicalSlug } from "@/lib/copy/slugs";
import { isCopyableFamily } from "@/lib/copy/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Copiar mezcla",
};

/** Depende de flags, del feed y del acceso: nunca se prerenderiza. */
export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function dateLabel(value: string): string {
  const parsed = Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(parsed) ? value : dateFormat.format(new Date(parsed));
}

async function currentUserId(): Promise<string> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return "";
    const { data, error } = await supabase.auth.getClaims();
    const sub: unknown = data?.claims?.sub;
    return !error && typeof sub === "string" ? sub : "";
  } catch {
    return "";
  }
}

/** Cabecera de la mezcla: rótulo, título y una línea de qué va a pasar. */
function MezclaHeader({ description }: { description: string }) {
  return (
    <header className="flex flex-col gap-2">
      <p className="font-mono text-[13px] leading-5 font-medium tracking-[0.045em] text-fg-muted uppercase">
        Copiar cartera
      </p>
      <h1 className="text-3xl leading-[1.1] tracking-tight text-balance sm:text-4xl">Copiar esta mezcla</h1>
      <p className="max-w-xl text-[15px] leading-6 text-fg-muted">{description}</p>
    </header>
  );
}

export default async function MezclaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  // El chat (`open_copy_mix`) puede prellenar el monto; se aceptan ambos nombres.
  const initialAmount =
    typeof query.monto === "string" ? query.monto : typeof query.amount === "string" ? query.amount : "";

  if (!(await isCopyEnabled())) {
    return (
      <article className="flex min-w-0 flex-col gap-8 pb-6">
        <MezclaHeader description="La mezcla se arma con la composición completa de la cartera." />
        <CopySoonState
          title="Pronto"
          description="Copiar carteras todavía no está disponible. Estamos afinando los últimos detalles con Fraccion.si."
        />
      </article>
    );
  }

  // Alias → canónico con 308. Un demo oculto de familia excluida no tiene
  // canónico y termina en 404.
  const canonical = canonicalSlug(slug) ?? slug.toLowerCase();
  if (canonical !== slug) permanentRedirect(`/app/copiar/${encodeURIComponent(canonical)}/mezcla`);

  const { health } = await getCopyIndex();
  if (health.state === "none") {
    return (
      <article className="flex min-w-0 flex-col gap-8 pb-6">
        <MezclaHeader description="La mezcla se arma con la composición completa de la cartera." />
        <CopySoonState title="Pronto" description="Todavía no hay carteras publicadas para armar una mezcla." />
      </article>
    );
  }

  const portfolio = await getCopyPortfolio(canonical);
  if (!portfolio) notFound();
  const meta = portfolio.portfolio;
  if (!isCopyableFamily(meta.family)) notFound();

  const userId = await currentUserId();
  const entitlement = userId ? await getCopyEntitlement(userId) : "none";
  const access = hasCopyAccess(entitlement);

  if (!access) {
    return (
      <article className="flex min-w-0 flex-col gap-8 pb-6">
        <Link
          href={`/app/copiar/${encodeURIComponent(canonical)}`}
          className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-full px-2 text-[13px] font-medium text-fg-muted transition-colors duration-150 hover:bg-surface-1 hover:text-fg"
        >
          <IconBack className="size-4" />
          {meta.name}
        </Link>
        <MezclaHeader description="La mezcla se arma con la composición completa de la cartera." />
        <FeedBanner health={health} />
        <Paywall
          title="Desbloquea la mezcla"
          description="Con Copiar carteras ves la composición, los movimientos y puedes armar la mezcla en demo con un clic. La cuenta con dinero real queda para después de la revisión legal."
        />
        <FraccionSeal />
      </article>
    );
  }

  const [mapped, realBuyEnabled] = await Promise.all([
    mapPositions(portfolio.positions, { family: meta.family }),
    isCopyRealBuyEnabled(),
  ]);
  const coveragePct = coverageOf(mapped);
  const availableCount = mapped.filter((position) => position.status === "available").length;
  const feedDead = isCopyFrozenByFeed(health);

  let blockedReason: string | null = null;
  if (entitlement === "past_due") {
    blockedReason = COPY_PAST_DUE_MESSAGE;
  } else if (feedDead) {
    blockedReason =
      "Los datos del feed están vencidos o no se pudieron verificar. Copiar queda desactivado hasta que se actualicen; la información sigue visible.";
  } else if (meta.isFrozen) {
    blockedReason =
      "Cartera congelada: el gestor dejó de declarar, así que no hay una cartera vigente que copiar.";
  } else if (coveragePct < COVERAGE_COPY_MIN) {
    blockedReason = "Esta cartera no se puede replicar bien en Maverlang.";
  }

  return (
    <article className="flex min-w-0 flex-col gap-8 pb-6">
      <div className="flex flex-col gap-4">
        <Link
          href={`/app/copiar/${encodeURIComponent(canonical)}`}
          className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-full px-2 text-[13px] font-medium text-fg-muted transition-colors duration-150 hover:bg-surface-1 hover:text-fg"
        >
          <IconBack className="size-4" />
          {meta.name}
        </Link>
        <MezclaHeader description="Elige el monto y la cuenta. Cada orden se confirma y se firma por separado; nada se ejecuta solo." />
      </div>

      <FeedBanner health={health} />
      {portfolio.example ? <ExampleDataStrip /> : null}

      <div className="w-full max-w-xl">
        <MixCart
          slug={canonical}
          versionId={portfolio.versionId}
          name={meta.name}
          manager={meta.manager}
          asOfLabel={dateLabel(meta.asOf)}
          coveragePct={coveragePct}
          availableCount={availableCount}
          totalCount={portfolio.positions.length}
          blockedReason={blockedReason}
          realBuyEnabled={realBuyEnabled}
          initialAmount={initialAmount}
          adjust={query.ajuste === "1"}
        />
      </div>

      <div className="flex max-w-xl flex-col gap-3 border-t border-border pt-6">
        <FraccionSeal />
        <p className="text-[13px] leading-relaxed text-fg-muted">{COPY_DISCLAIMER}</p>
        <p className="text-[13px] leading-relaxed text-fg-muted">{COPY_LEGAL_PENDING_LABEL}</p>
      </div>
    </article>
  );
}
