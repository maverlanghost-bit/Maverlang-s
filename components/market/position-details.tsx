"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { useT } from "@/lib/hooks/use-t";
import { formatMoney, formatPercent, formatShares } from "@/lib/format";
import type { Currency, Position } from "@/lib/types";

export function PositionDetails({ position, name, logoUrl, href, currency, rate, pendingFx, masked, totalUsd, token = false, earn = false }: {
  position: Position; name: string; logoUrl?: string | null; href: string; currency: Currency; rate?: number; pendingFx: boolean; masked: boolean; totalUsd: number; token?: boolean; earn?: boolean;
}) {
  const { t, language } = useT();
  const en = language === "en";
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const fxKnown = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const shownCurrency: Currency = currency === "CLP" && fxKnown ? "CLP" : "USD";
  const multiplier = shownCurrency === "CLP" && typeof rate === "number" ? rate : 1;
  const missing = en ? "Unknown" : "Sin dato";
  const money = (value: number | null) => masked ? "••••" : pendingFx ? "…" : value === null || !Number.isFinite(value) ? missing : formatMoney(value * multiplier, shownCurrency);
  const ratio = (value: number | null) => masked ? "••••" : value === null || !Number.isFinite(value) ? missing : formatPercent(value);
  const rows = [
    [en ? "Asset type" : "Tipo de activo", earn ? (en ? "Earn token" : "Token en Ganar") : token ? (en ? "Crypto / token" : "Cripto / token") : (en ? "Tokenized stock" : "Acción tokenizada")],
    [token ? (en ? "Tokens" : "Tokens") : (en ? "Shares displayed" : "Acciones mostradas"), masked ? "••••" : formatShares(position.shares)],
    [en ? "Current value" : "Valor actual", money(position.valueUsd)],
    [en ? "Price per unit" : "Precio por unidad", money(position.priceUsd)],
    [en ? "Average cost per unit" : "Coste medio por unidad", money(position.avgCostUsd)],
    [en ? "Profit / loss" : "Ganancia / pérdida", money(position.pnlUsd)],
    [en ? "Change against cost" : "Variación frente al coste", ratio(position.pnlPct)],
    [en ? "Portfolio weight" : "Peso en la cartera", ratio(totalUsd > 0 ? position.valueUsd / totalUsd : null)],
  ];
  return <>
    <DropdownMenu><DropdownMenuTrigger asChild><IconButton ref={trigger} label={`${en ? "Position options" : "Opciones de posición"}: ${name}`}><span aria-hidden className="text-lg">⋯</span></IconButton></DropdownMenuTrigger><DropdownMenuContent align="end" onCloseAutoFocus={(event) => { if (open) event.preventDefault(); }}>
      <DropdownMenuItem onSelect={() => setOpen(true)}>{en ? "View position details" : "Ver detalle de la posición"}</DropdownMenuItem>
      <DropdownMenuItem asChild><Link href={href}>{en ? "Open asset" : "Abrir ficha del activo"}</Link></DropdownMenuItem>
      {position.shares > 0 ? <><DropdownMenuSeparator /><DropdownMenuItem asChild><Link href={earn ? href : `${href}?operar=vender`}>{earn ? (en ? "Open Earn to sell" : "Abrir Ganar para vender") : t.detail.sell}</Link></DropdownMenuItem></> : null}
    </DropdownMenuContent></DropdownMenu>
    <Sheet open={open} onOpenChange={(next) => { setOpen(next); if (!next) window.requestAnimationFrame(() => trigger.current?.focus()); }} title={en ? "Position details" : "Detalle de la posición"}>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3"><TickerLogo symbol={position.symbol} name={name} logoUrl={logoUrl} size={36} decorative /><div><h3 className="text-base font-medium">{name}</h3><p className="font-mono text-xs text-fg-muted">{position.symbol}</p></div></div>
        <dl className="divide-y divide-border">{rows.map(([label, value]) => <div key={label} className="flex items-start justify-between gap-4 py-3 text-sm"><dt className="text-fg-muted">{label}</dt><dd className="num text-right">{value}</dd></div>)}</dl>
        {!token ? <p className="text-xs text-fg-muted">{en ? "Share quantities already include the issuer multiplier." : "Las cantidades de acciones ya incluyen el multiplicador del emisor."}</p> : null}
        <p className="text-xs text-fg-muted">{shownCurrency}{shownCurrency === "CLP" ? (en ? " · conversion at current reference FX" : " · conversión al dólar de referencia actual") : currency === "CLP" ? (en ? " · exchange rate unavailable" : " · sin tipo de cambio disponible") : ""} · {en ? "Unknown cost or profit remains unknown." : "Los costes o resultados desconocidos se muestran sin dato."}</p>
        <Button asChild variant="secondary"><Link href={href}>{earn ? (en ? "View in Earn" : "Ver en Ganar") : (en ? "View asset" : "Ver ficha del activo")}</Link></Button>
      </div>
    </Sheet>
  </>;
}
