"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { useT } from "@/lib/hooks/use-t";

/**
 * Página Herramientas (celular y escritorio): las mismas herramientas del menú
 * «Herramientas» de `MarketSectionChips`, como filas grandes. Sólo enlaces.
 */

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const TOOLS: { href: string; es: [string, string]; en: [string, string]; icon: ReactNode }[] = [
  {
    href: "/app/screener",
    es: ["Screener", "Filtra acciones por sector, precio y variación."],
    en: ["Screener", "Filter stocks by sector, price and change."],
    icon: <svg viewBox="0 0 24 24" className="size-6" aria-hidden {...stroke}><path d="M4 6h16M7 12h10M10 18h4" /></svg>,
  },
  {
    href: "/app/comparar",
    es: ["Comparar", "Pon dos o más acciones lado a lado."],
    en: ["Compare", "Put two or more stocks side by side."],
    icon: <svg viewBox="0 0 24 24" className="size-6" aria-hidden {...stroke}><path d="M8 4 4 8l4 4M4 8h13M16 20l4-4-4-4M20 16H7" /></svg>,
  },
  {
    href: "/app/alertas",
    es: ["Alertas", "Avisos cuando una acción llegue a tu precio."],
    en: ["Alerts", "Get notified when a stock hits your price."],
    icon: <svg viewBox="0 0 24 24" className="size-6" aria-hidden {...stroke}><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15L6 17Zm4 4h4" /></svg>,
  },
];

export function ToolsScreen() {
  const { language } = useT();
  const en = language === "en";
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <h1 className="text-2xl font-bold tracking-tight text-fg">{en ? "Tools" : "Herramientas"}</h1>
      <ul className="flex flex-col gap-3">
        {TOOLS.map((tool) => {
          const [name, description] = en ? tool.en : tool.es;
          return (
            <li key={tool.href}>
              <Link
                href={tool.href}
                className="flex min-h-20 items-center gap-4 rounded-[24px] border border-border bg-bg p-4 outline-none transition-colors hover:bg-surface-1 focus-visible:ring-2 focus-visible:ring-fg"
              >
                <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-1 text-fg">
                  {tool.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] leading-6 font-semibold text-fg">{name}</span>
                  <span className="block text-[14px] leading-5 text-fg-muted">{description}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
