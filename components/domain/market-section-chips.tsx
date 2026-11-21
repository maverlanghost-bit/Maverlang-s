"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type MarketSectionId = "stocks" | "crypto" | "screener" | "compare" | "mix" | "alerts" | "copy";
type CryptoSubTabId = "tokens" | "earn";
const CRYPTO_SUB_TABS = [
  { id: "tokens", href: "/app/cripto", label: "Tokens" },
  { id: "earn", href: "/app/ganar", label: "Ganar" },
] as const;
const TOOLS = [
  { id: "screener", href: "/app/screener", es: "Screener", en: "Screener" },
  { id: "compare", href: "/app/comparar", es: "Comparar", en: "Compare" },
  { id: "mix", href: "/app/mix", es: "Armar Mix", en: "Build a mix" },
  { id: "alerts", href: "/app/alertas", es: "Alertas", en: "Alerts" },
] as const;
const linkClass = "inline-flex min-h-11 shrink-0 items-center justify-center text-[13px] font-medium whitespace-nowrap text-fg-muted hover:text-fg sm:min-h-9";

/** Primary asset types stay visible; analytical tools use a keyboard-accessible menu. */
export function MarketSectionChips({ active, showCopy = false }: { active: MarketSectionId; showCopy?: boolean }) {
  const { language } = useT();
  const en = language === "en";
  const activeTool = TOOLS.find((tool) => tool.id === active);
  const primary = [
    { id: "stocks", href: "/app", label: en ? "Stocks" : "Acciones" },
    { id: "crypto", href: "/app/cripto", label: en ? "Crypto" : "Cripto" },
    ...(showCopy ? [{ id: "copy", href: "/app/copiar", label: en ? "Copy" : "Copiar" }] : []),
  ];
  return <nav aria-label={en ? "Market sections" : "Secciones del mercado"} className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1">
    {primary.map((section) => <Link key={section.id} href={section.href} aria-current={section.id === active ? "page" : undefined} className={cn(linkClass, section.id === active && "text-fg underline decoration-2 underline-offset-[5px]")}>{section.label}</Link>)}
    <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className={cn(linkClass, "gap-1.5", activeTool && "text-fg underline decoration-2 underline-offset-[5px]")}>{activeTool ? activeTool[en ? "en" : "es"] : en ? "Tools" : "Herramientas"}<span aria-hidden>⌄</span></button></DropdownMenuTrigger><DropdownMenuContent align="end">{TOOLS.map((tool) => <DropdownMenuItem key={tool.id} asChild><Link href={tool.href} aria-current={tool.id === active ? "page" : undefined}>{tool[en ? "en" : "es"]}{tool.id === active ? <span className="ml-auto" aria-hidden>✓</span> : null}</Link></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
  </nav>;
}

export function CryptoSubTabs({ active }: { active: CryptoSubTabId }) {
  const { language } = useT();
  const en = language === "en";
  return <div className="flex min-w-0 flex-col gap-3">
    <MarketSectionChips active="crypto" />
    <nav aria-label={en ? "Crypto subsections" : "Subsecciones de cripto"} className="inline-flex w-fit items-center gap-1 rounded-full border border-border bg-surface-1 p-1">
      {CRYPTO_SUB_TABS.map((tab) => <Link key={tab.id} href={tab.href} aria-current={tab.id === active ? "page" : undefined} className={cn("inline-flex min-h-11 items-center justify-center rounded-full px-4 text-[13px] font-medium transition-colors sm:min-h-9", tab.id === active ? "bg-bg text-fg shadow-xs ring-1 ring-border/60" : "text-fg-muted hover:text-fg")}>{tab.id === "earn" && en ? "Earn" : tab.label}</Link>)}
    </nav>
  </div>;
}
