import Link from "next/link";
import { ChangeBadge } from "@/components/domain/change-badge";
import { PriceText } from "@/components/domain/price-text";
import { Sparkline } from "@/components/domain/sparkline";
import { TickerLogo } from "@/components/domain/ticker-logo";
import type { MoneyCurrency } from "@/lib/format";

export function TickerRow({
  href,
  symbol,
  name,
  logoUrl,
  price,
  currency = "USD",
  change,
  sparkline,
}: {
  href: string;
  symbol: string;
  name: string;
  logoUrl?: string | null;
  price: number;
  currency?: MoneyCurrency;
  change: number;
  sparkline?: number[];
}) {
  return (
    <Link
      href={href}
      className="flex h-16 items-center gap-2 rounded-xl px-2 transition duration-[140ms] hover:bg-surface-2 sm:gap-3 sm:px-3"
    >
      <TickerLogo symbol={symbol} name={name} logoUrl={logoUrl} size={36} decorative />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-fg">{symbol}</span>
        <span className="block truncate text-sm text-fg-muted">{name}</span>
      </span>
      {sparkline ? <Sparkline data={sparkline} width={72} height={28} className="hidden sm:block" /> : null}
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <PriceText value={price} currency={currency} size="sm" />
        <ChangeBadge value={change} />
      </span>
    </Link>
  );
}
