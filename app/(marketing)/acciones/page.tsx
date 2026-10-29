import Link from "next/link";
import { LandingSection } from "@/components/landing/section";
import { HUB_DESCRIPTION, HUB_TITLE } from "@/lib/seo/copy";
import { pageMetadata } from "@/lib/seo/metadata";
import { listPublicAssets } from "@/lib/seo/public-catalog";

export const revalidate = 3600;

export const metadata = pageMetadata({
  title: HUB_TITLE,
  description: HUB_DESCRIPTION,
  path: "/acciones",
  absolute: true,
});

/** Hub indexable: enlaza cada ficha pública del catálogo visible. */
export default async function AccionesPage() {
  const assets = [...(await listPublicAssets())].sort(
    (a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }) || a.ticker.localeCompare(b.ticker),
  );

  return (
    <LandingSection titleId="acciones-title">
      <div className="max-w-2xl">
        <p className="label">Acciones</p>
        <h1 id="acciones-title" className="mt-3 text-3xl sm:text-4xl">
          Acciones de EE.UU.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-fg-body sm:text-base">
          Fracciones de acciones tokenizadas de EE.UU., desde Chile. Cada ficha describe un token que
          sigue el precio. La demo usa saldo ficticio y se opera 24/7.
        </p>
      </div>
      {assets.length === 0 ? (
        <p className="mt-10 text-sm text-fg-muted">El catálogo no está disponible ahora.</p>
      ) : (
        <ul className="mt-10 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => (
            <li key={asset.slug}>
              <Link
                href={`/acciones/${asset.slug}`}
                className="flex min-h-11 items-baseline justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-surface-1"
              >
                <span className="font-medium text-fg">{asset.name}</span>
                <span className="shrink-0 text-fg-muted">{asset.ticker}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </LandingSection>
  );
}
