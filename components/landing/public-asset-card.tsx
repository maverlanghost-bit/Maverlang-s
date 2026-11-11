import Link from "next/link";

import { TickerLogo } from "@/components/domain/ticker-logo";
import { Badge } from "@/components/ui/badge";
import { logoPathFromSymbol } from "@/lib/catalog/logos";
import { cn } from "@/lib/cn";

/**
 * Fila/card única del catálogo público (`/acciones`, `/categorias/[slug]` y
 * "Acciones parecidas"). Reemplaza las tres recetas distintas que había.
 *
 * `sector` llega como prop desde el servidor (`sectorFor` lee el SIC de la SEC
 * en `lib/seo/categories`): el cliente nunca importa ese módulo ni el perfil de
 * la empresa, así que la grilla no arrastra datos al bundle.
 */
export type PublicAssetCardItem = {
  slug: string;
  name: string;
  /** Ticker de la empresa, sin sufijo de token (AAPL). */
  ticker: string;
  /** Símbolo del token en la app (AAPLx). */
  symbol: string;
  etf: boolean;
  /** Nombre del sector según el SIC de la SEC. `null` si no hay dato. */
  sector?: string | null;
};

export type PublicAssetCardVariant = "card" | "row";

export function PublicAssetCard({
  asset,
  variant = "card",
  className,
}: {
  asset: PublicAssetCardItem;
  /** `row` en grillas densas (4 columnas), `card` en grillas de 3. */
  variant?: PublicAssetCardVariant;
  className?: string;
}) {
  const row = variant === "row";
  const kind = asset.etf ? "ETF" : "Acción";
  const sectorName = asset.sector?.trim();
  // El sector "ETF" repetiría el badge de tipo: se omite como subtítulo.
  const sector = sectorName && sectorName.toLowerCase() !== kind.toLowerCase() ? sectorName : null;

  return (
    <Link
      href={`/acciones/${asset.slug}`}
      aria-label={`${asset.name} (${asset.ticker}), token ${asset.symbol}${sector ? `, ${sector}` : ""}`}
      className={cn(
        "group flex items-center gap-3 bg-bg transition duration-[140ms] ease-spring hover:bg-surface-1",
        row ? "min-h-16 rounded-2xl px-3 py-2.5 shadow-card" : "min-h-24 rounded-3xl p-4 shadow-card",
        className,
      )}
    >
      <TickerLogo
        symbol={asset.symbol}
        name={asset.name}
        logoUrl={logoPathFromSymbol(asset.symbol)}
        size={row ? 32 : 40}
        decorative
        loading="lazy"
        sizes={row ? "32px" : "40px"}
      />
      <span className="min-w-0 flex-1">
        <span
          title={asset.name}
          className={cn(
            "block font-medium text-fg",
            row ? "line-clamp-1 text-sm sm:line-clamp-2" : "line-clamp-2 text-base leading-snug",
          )}
        >
          {asset.name}
        </span>
        {sector ? <span className="mt-0.5 block truncate text-xs text-fg-muted">{sector}</span> : null}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-mono text-xs text-fg-muted">{asset.ticker}</span>
        <Badge tone="neutral" className="px-2 py-0">
          {kind}
        </Badge>
      </span>
    </Link>
  );
}
