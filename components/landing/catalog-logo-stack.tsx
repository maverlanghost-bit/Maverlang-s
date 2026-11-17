import { TickerLogo } from "@/components/domain/ticker-logo";
import { logoPathFromSymbol } from "@/lib/catalog/logos";
import { cn } from "@/lib/cn";

type StackAsset = { symbol: string; name: string };

/**
 * Pila de logos superpuestos (T70): hasta `max` activos reales y, si hay más,
 * un círculo con cuántos faltan. Es decorativa: el nombre de la categoría o del
 * par ya está en el texto vecino.
 */
export function CatalogLogoStack({
  assets,
  max = 5,
  size = 36,
  eager = false,
  className,
}: {
  assets: readonly StackAsset[];
  max?: number;
  size?: number;
  eager?: boolean;
  className?: string;
}) {
  const shown = assets.slice(0, max);
  const extra = assets.length - shown.length;
  const overlap = size >= 56 ? "-ml-4" : "-ml-2.5";

  return (
    <span aria-hidden className={cn("inline-flex items-center", className)}>
      {shown.map((asset, index) => (
        <TickerLogo
          key={asset.symbol}
          symbol={asset.symbol}
          name={asset.name}
          logoUrl={logoPathFromSymbol(asset.symbol)}
          size={size}
          decorative
          loading={eager ? "eager" : "lazy"}
          sizes={`${size}px`}
          className={cn("ring-2 ring-bg", index > 0 && overlap)}
        />
      ))}
      {extra > 0 ? (
        <span
          className={cn(
            "num inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-[11px] text-fg-muted ring-2 ring-bg",
            overlap,
          )}
          style={{ width: size, height: size }}
        >
          +{extra}
        </span>
      ) : null}
    </span>
  );
}
