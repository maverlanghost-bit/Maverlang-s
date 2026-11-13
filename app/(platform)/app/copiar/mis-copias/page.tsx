import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { CopySoonState } from "@/components/copy/empty-states";
import { FollowList, type FollowCard } from "@/components/copy/follow-list";
import { FraccionSeal } from "@/components/copy/fraccion-seal";
import { LegalNote } from "@/components/copy/legal-note";
import { Paywall } from "@/components/copy/paywall";
import { Button, buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getCopyEntitlement, hasCopyAccess } from "@/lib/copy/access";
import { getCopyIndex, getCopyPortfolio } from "@/lib/copy/feed";
import { isCopyEnabled } from "@/lib/copy/flags";
import { canonicalSlug } from "@/lib/copy/slugs";
import type { CopyPosition } from "@/lib/copy/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Mis copias",
};

/** Depende de flags, del feed y del acceso: nunca se prerenderiza. */
export const dynamic = "force-dynamic";

/** Fila de `copy_follows` tal como la lee el servidor (puede no existir la tabla). */
type FollowRow = {
  slug: string | null;
  version_id: string | null;
  weights: unknown;
  created_at: string | null;
};

const MAX_FOLLOWS = 10;

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

/**
 * Lee `copy_follows` con el cliente de servidor, igual que `/api/copy/follow`.
 * Si la migración no está aplicada (o no hay Supabase) la consulta falla: se
 * devuelve `null` y la página muestra «Pronto» sin romper.
 */
async function readFollows(userId: string): Promise<FollowRow[] | null> {
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return null;
  }
  try {
    const { data, error } = await admin
      .from("copy_follows")
      .select("slug,version_id,weights,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_FOLLOWS);
    if (error) return null;
    return (data ?? []) as FollowRow[];
  } catch {
    return null;
  }
}

function weightsOf(positions: CopyPosition[]): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const position of positions) {
    if (position.side === "short") continue;
    if (typeof position.symbol === "string" && Number.isFinite(position.weight)) {
      weights[position.symbol] = position.weight;
    }
  }
  return weights;
}

/** Acepta `[{symbol, weight}]` o `{symbol: weight}`; ignora lo que no calce. */
function storedWeights(raw: unknown): Record<string, number> {
  const weights: Record<string, number> = {};
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (entry === null || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const symbol = record.symbol;
      const weight = record.weight;
      if (typeof symbol === "string" && typeof weight === "number" && Number.isFinite(weight)) {
        weights[symbol] = weight;
      }
    }
    return weights;
  }
  if (raw !== null && typeof raw === "object") {
    for (const [symbol, weight] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof weight === "number" && Number.isFinite(weight)) weights[symbol] = weight;
    }
  }
  return weights;
}

/** Umbral de aviso: cualquier peso que se mueva más de 2 puntos. */
function movedMoreThan(previous: Record<string, number>, current: Record<string, number>, points: number): boolean {
  const symbols = new Set([...Object.keys(previous), ...Object.keys(current)]);
  for (const symbol of symbols) {
    if (Math.abs((previous[symbol] ?? 0) - (current[symbol] ?? 0)) > points) return true;
  }
  return false;
}

async function buildCards(rows: FollowRow[]): Promise<FollowCard[]> {
  const cards = await Promise.all(
    rows.slice(0, MAX_FOLLOWS).map(async (row): Promise<FollowCard | null> => {
      const slug = typeof row.slug === "string" ? canonicalSlug(row.slug) : null;
      if (!slug) return null;
      const copiedVersionId = typeof row.version_id === "string" ? row.version_id : "";
      const portfolio = await getCopyPortfolio(slug);
      if (!portfolio) {
        return {
          slug,
          name: slug,
          manager: "",
          family: null,
          asOfLabel: "",
          copiedVersionId,
          currentVersionId: "",
          moved: false,
          weightsKnown: false,
          missing: true,
          example: false,
        };
      }
      const previous = storedWeights(row.weights);
      const weightsKnown = Object.keys(previous).length > 0;
      return {
        slug,
        name: portfolio.portfolio.name,
        manager: portfolio.portfolio.manager,
        family: portfolio.portfolio.family,
        asOfLabel: dateLabel(portfolio.portfolio.asOf),
        copiedVersionId,
        currentVersionId: portfolio.versionId,
        moved: weightsKnown && movedMoreThan(previous, weightsOf(portfolio.positions), 2),
        weightsKnown,
        missing: false,
        example: portfolio.example,
      };
    }),
  );
  return cards.filter((card): card is FollowCard => card !== null);
}

/** Una copia pide atención cuando la versión cambió y algún peso se movió. */
function needsReview(card: FollowCard): boolean {
  const versionChanged =
    card.copiedVersionId.length > 0 && card.copiedVersionId !== card.currentVersionId;
  return !card.missing && card.moved && versionChanged;
}

/**
 * Orden por dato real: primero lo que pide una acción, al final lo que ya no
 * está en el feed. Dentro de cada grupo se respeta el orden de `created_at`
 * que devolvió la consulta (la más reciente primero).
 */
function orderCards(cards: FollowCard[]): FollowCard[] {
  const rank = (card: FollowCard) => (needsReview(card) ? 0 : card.missing ? 2 : 1);
  return [...cards].sort((a, b) => rank(a) - rank(b));
}

/**
 * Cabecera propia de la sección: misma escala que el catálogo y los planes
 * (H1 3xl/4xl y entradilla de 15 px), para que las cuatro pantallas lean igual.
 */
function CopiasHeader({
  title = "Mis copias",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
      <div className="min-w-0">
        <h1 className="text-3xl leading-[1.1] tracking-tight text-balance sm:text-4xl">{title}</h1>
        {description ? <p className="mt-3 max-w-xl text-[15px] leading-6 text-fg-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

function Soon() {
  return (
    <article className="flex flex-col gap-8 pb-6">
      <CopiasHeader />
      <CopySoonState
        title="Pronto"
        description="Todavía no podemos mostrarte las carteras que sigues. Estamos afinando los últimos detalles con Fraccion.si."
      />
    </article>
  );
}

export default async function MisCopiasPage() {
  if (!(await isCopyEnabled())) return <Soon />;

  const userId = await currentUserId();
  const entitlement = userId ? await getCopyEntitlement(userId) : "none";
  const access = hasCopyAccess(entitlement);

  if (!userId || !access) {
    return (
      <article className="flex flex-col gap-8 pb-6">
        <CopiasHeader
          title="Mis copias"
          description="Las carteras que sigues, la versión que copiaste y el aviso cuando cambian."
        />
        <p className="max-w-prose text-[13px] leading-relaxed text-fg-muted">
          {userId
            ? "Tu cuenta todavía no tiene una suscripción activa a Copiar carteras."
            : "Entra con tu cuenta de Maverlang para ver las carteras que sigues."}
        </p>
        <Paywall
          title="Desbloquea tus copias"
          description={`Con Copiar carteras puedes seguir hasta ${MAX_FOLLOWS} carteras, comparar la versión que copiaste con la actual y armar un ajuste cuando cambian.`}
        />
      </article>
    );
  }

  const rows = await readFollows(userId);
  if (rows === null) return <Soon />;

  const { health } = await getCopyIndex();
  if (health.state === "none") return <Soon />;

  const cards = await buildCards(rows);
  const ordered = orderCards(cards);
  const pendingReview = cards.filter(needsReview).length;

  return (
    <article className="flex flex-col gap-8 pb-6">
      <CopiasHeader
        title="Mis copias"
        description={`La versión que copiaste contra la actual. Hasta ${MAX_FOLLOWS} carteras.`}
        action={
          cards.length > 0 ? (
            <Link
              href="/app/copiar"
              className={buttonClasses({ variant: "secondary", size: "md", className: "min-h-11" })}
            >
              Ver carteras
            </Link>
          ) : undefined
        }
      />

      {cards.length === 0 ? (
        <EmptyState
          title="Todavía no sigues ninguna cartera"
          description="Cuando copies una cartera la vas a ver acá, con la versión que copiaste y el aviso si cambia."
          action={
            <Button asChild size="lg" className="min-h-11 touch-manipulation">
              <Link href="/app/copiar">Ver carteras</Link>
            </Button>
          }
        />
      ) : (
        <section aria-labelledby="copias-titulo" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="copias-titulo" className="text-lg font-medium tracking-tight">
              Carteras que sigues
            </h2>
            <p className="text-[13px] leading-5 text-fg-muted">
              {cards.length} de {MAX_FOLLOWS}
            </p>
          </div>
          {pendingReview > 0 && cards.length > 1 ? (
            <p className="text-[13px] leading-5 text-fg-muted">Primero las que cambiaron.</p>
          ) : null}
          <FollowList items={ordered} />
        </section>
      )}

      <footer className="flex flex-col gap-3">
        <FraccionSeal />
        <LegalNote disclaimer />
      </footer>
    </article>
  );
}
