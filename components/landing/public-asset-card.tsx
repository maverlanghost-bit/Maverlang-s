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
  /**
   * Precio ya formateado (`US$ 187,42`). El catálogo público no lo entrega
   * hoy: si ninguna ficha lo trae, la columna de precio no se dibuja.
   */
  price?: string | null;
};

/** `table` es la fila del catálogo completo; `row` y `card` siguen en uso. */
export type PublicAssetCardVariant = "card" | "row" | "table";

/**
 * Plantilla de columnas de la tabla: la comparten el encabezado
 * (`public-catalog-grid`) y cada fila, para que no se desalineen nunca.
 * Móvil: ticker + nombre. Desde `sm`: ticker · nombre · sector [· precio].
 */
export function publicAssetGridColumns(hasPrice: boolean): string {
  return hasPrice
    ? "grid-cols-[5rem_minmax(0,1fr)] sm:grid-cols-[6rem_minmax(0,1fr)_10rem_7rem]"
    : "grid-cols-[5rem_minmax(0,1fr)] sm:grid-cols-[6rem_minmax(0,1fr)_10rem]";
}

export function PublicAssetCard({
  asset,
  variant = "card",
  showPrice = false,
  className,
}: {
  asset: PublicAssetCardItem;
  /** `row` en grillas densas (4 columnas), `card` en grillas de 3. */
  variant?: PublicAssetCardVariant;
  /** Sólo `table`: dibuja la celda de precio (el encabezado la acompaña). */
  showPrice?: boolean;
  className?: string;
}) {
  const row = variant === "row";
  const kind = asset.etf ? "ETF" : "Acción";
  const sectorName = asset.sector?.trim();
  // El sector "ETF" repetiría el badge de tipo: se omite como subtítulo.
  const sector = sectorName && sectorName.toLowerCase() !== kind.toLowerCase() ? sectorName : null;
  // En la tabla el tipo no tiene badge propio: si no hay sector, se nombra.
  const sectorCell = sector ?? kind;
  const price = asset.price?.trim();

  if (variant === "table") {
    return (
      <Link
        href={`/acciones/${asset.slug}`}
        aria-label={`${asset.name} (${asset.ticker}), token ${asset.symbol}${sector ? `, ${sector}` : ""}`}
        className={cn(
          "group grid items-center gap-x-4 py-3 transition-colors duration-[140ms] ease-spring hover:bg-surface-1",
          publicAssetGridColumns(showPrice),
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <TickerLogo
            symbol={asset.symbol}
            name={asset.name}
            logoUrl={logoPathFromSymbol(asset.symbol)}
            size={24}
            decorative
            loading="lazy"
            sizes="24px"
          />
          <span className="font-mono text-[13px] font-medium tracking-tight text-fg">{asset.ticker}</span>
        </span>
        {/* Sin `truncate` ni `line-clamp`: el nombre largo envuelve en móvil. */}
        <span className="min-w-0">
          <span className="block text-sm leading-snug font-medium text-fg">{asset.name}</span>
          <span className="mt-0.5 block text-xs text-fg-muted sm:hidden">{sectorCell}</span>
        </span>
        <span className="hidden min-w-0 truncate text-xs text-fg-muted sm:block" title={sectorCell}>
          {sectorCell}
        </span>
        {showPrice ? (
          <span className="num hidden text-right text-[13px] whitespace-nowrap text-fg sm:block">{price || "—"}</span>
        ) : null}
      </Link>
    );
  }

  return (
    <Link
      href={`/acciones/${asset.slug}`}
      aria-label={`${asset.name} (${asset.ticker}), token ${asset.symbol}${sector ? `, ${sector}` : ""}`}
      className={cn(
        "group flex items-center gap-3 bg-bg transition duration-[140ms] ease-spring hover:bg-surface-1",
        row ? "min-h-16 px-0 py-2.5" : "min-h-24 rounded-xl border border-border p-4 hover:border-border-strong",
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
        {sector ? (
          <span title={sector} className="mt-0.5 block truncate text-xs text-fg-muted">
            {sector}
          </span>
        ) : null}
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
