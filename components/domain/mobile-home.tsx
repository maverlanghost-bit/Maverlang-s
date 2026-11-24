"use client";

import { useRef, useState, type ReactNode, type SVGProps } from "react";
import Link from "next/link";

import { IconChart, IconPortfolio, IconStar, IconWallet } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useAccountMode } from "@/lib/hooks/use-account-mode";
import { useHideBalance } from "@/lib/hooks/use-hide-balance";
import { useT } from "@/lib/hooks/use-t";
import { LANDING_MIN_ORDER_USD } from "@/lib/market/asset-status.shared";

/**
 * Inicio del Mercado en celular: acciones principales, accesos secundarios y
 * carrusel de mensajes. Todo son enlaces a rutas existentes; no consulta datos.
 */

type SvgProps = SVGProps<SVGSVGElement>;

function glyph(props: SvgProps, children: ReactNode) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      {children}
    </svg>
  );
}

const GlyphPlus = (p: SvgProps) => glyph(p, <path d="M12 5v14M5 12h14" />);
const GlyphSell = (p: SvgProps) => glyph(p, <path d="M5 12h14" />);
const GlyphDeposit = (p: SvgProps) => glyph(p, <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />);
const GlyphCrypto = (p: SvgProps) =>
  glyph(p, <><circle cx="12" cy="12" r="8" /><path d="M10 8h3a1.8 1.8 0 0 1 0 3.6h-3m0 0h3.4a1.8 1.8 0 0 1 0 3.6H10m0-7.2v7.2" /></>);
const GlyphCopy = (p: SvgProps) =>
  glyph(p, <><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.5M17.5 14.2a5.5 5.5 0 0 1 3 4.8" /></>);
const GlyphMix = (p: SvgProps) => glyph(p, <path d="M12 3a9 9 0 1 0 9 9h-9V3Zm3 0.5A9 9 0 0 1 20.5 9H15V3.5Z" />);
const GlyphScreener = (p: SvgProps) => glyph(p, <path d="M4 6h16M7 12h10M10 18h4" />);
const GlyphAssistant = (p: SvgProps) =>
  glyph(p, <path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 16h-8l-4.5 3.5V16H5a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 5 5Z" />);
const GlyphCompare = (p: SvgProps) => glyph(p, <path d="M8 4 4 8l4 4M4 8h13M16 20l4-4-4-4M20 16H7" />);
const GlyphAlert = (p: SvgProps) =>
  glyph(p, <path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15L6 17Zm4 4h4" />);
const GlyphClock = (p: SvgProps) => glyph(p, <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>);

export function MobileQuickActions({ className }: { className?: string }) {
  const { language } = useT();
  const en = language === "en";
  const { userId } = useHideBalance();
  // Sin sesión, las acciones llevan al registro; Comprar baja a la lista.
  const gate = "/app/registro";
  const actions = [
    { id: "buy", label: en ? "Buy" : "Comprar", href: "#acciones", icon: <GlyphPlus className="size-6" /> },
    { id: "sell", label: en ? "Sell" : "Vender", href: userId ? "/app/cartera" : gate, icon: <GlyphSell className="size-6" /> },
    { id: "deposit", label: en ? "Deposit" : "Depositar", href: userId ? "/app/billetera/depositar" : gate, icon: <GlyphDeposit className="size-6" /> },
    { id: "wallet", label: en ? "Wallet" : "Billetera", href: userId ? "/app/billetera" : gate, icon: <IconWallet className="size-6" /> },
  ];
  return (
    <nav aria-label={en ? "Main actions" : "Acciones principales"} className={cn("grid grid-cols-4 gap-2", className)}>
      {actions.map((action) => (
        <Link key={action.id} href={action.href} className="group flex flex-col items-center gap-2 py-1 outline-none">
          <span className="grid size-14 place-items-center rounded-full bg-fg text-bg transition-transform group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-fg group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-bg">
            {action.icon}
          </span>
          <span className="text-[13px] leading-4 font-medium text-fg">{action.label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function MobileShortcuts({ showCopy, className }: { showCopy: boolean; className?: string }) {
  const { language } = useT();
  const en = language === "en";
  const items = [
    { href: "/app/favoritas", label: en ? "Favorites" : "Favoritas", icon: <IconStar className="size-7" /> },
    { href: "/app/cripto", label: en ? "Crypto" : "Cripto", icon: <GlyphCrypto className="size-7" /> },
    ...(showCopy ? [{ href: "/app/copiar", label: en ? "Copy" : "Copiar", icon: <GlyphCopy className="size-7" /> }] : []),
    { href: "/app/mix", label: "Mix", icon: <GlyphMix className="size-7" /> },
    { href: "/app/screener", label: "Screener", icon: <GlyphScreener className="size-7" /> },
    { href: "/app/asistente", label: en ? "AI assistant" : "Asistente IA", icon: <GlyphAssistant className="size-7" /> },
    { href: "/app/comparar", label: en ? "Compare" : "Comparar", icon: <GlyphCompare className="size-7" /> },
    { href: "/app/alertas", label: en ? "Alerts" : "Alertas", icon: <GlyphAlert className="size-7" /> },
  ].slice(0, 8);
  return (
    <nav aria-label={en ? "Shortcuts" : "Accesos"} className={cn("grid grid-cols-4 gap-x-2 gap-y-4", className)}>
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="group flex flex-col items-center gap-1.5 outline-none">
          <span className="grid size-[52px] place-items-center rounded-2xl bg-surface-1 text-fg transition-transform group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-fg">
            {item.icon}
          </span>
          <span className="max-w-full truncate text-xs leading-4 text-fg-body">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

type Promo = { id: string; title: string; body: string; cta?: { label: string; href: string }; art: ReactNode };

export function MobilePromoCarousel({ className }: { className?: string }) {
  const { language } = useT();
  const en = language === "en";
  const { mode } = useAccountMode();
  const scroller = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);

  const promos: Promo[] = [
    ...(mode === "demo"
      ? [
          {
            id: "demo",
            title: en ? "Practice with US$10,000 in play money" : "Practica con US$10.000 ficticios",
            body: en ? "Try buying and selling without risking real money." : "Prueba comprar y vender sin arriesgar plata real.",
            cta: { label: en ? "See stocks" : "Ver acciones", href: "#acciones" },
            art: <IconChart className="size-8" />,
          },
        ]
      : []),
    {
      id: "min",
      title: en ? `Buy from US$${LANDING_MIN_ORDER_USD}` : `Compra desde US$${LANDING_MIN_ORDER_USD}`,
      body: en ? "Fractions of US stocks, no need to buy a whole share." : "Fracciones de acciones de EE.UU., sin comprar una entera.",
      cta: { label: en ? "Explore" : "Explorar", href: "#acciones" },
      art: <IconPortfolio className="size-8" />,
    },
    {
      id: "247",
      title: en ? "Trade 24/7" : "Opera 24/7",
      body: en
        ? "Outside regular US market hours the price can move more."
        : "Fuera del horario regular de la bolsa de EE.UU. el precio puede variar más.",
      art: <GlyphClock className="size-8" />,
    },
  ];

  function onScroll() {
    const el = scroller.current;
    if (!el || el.clientWidth === 0) return;
    setIndex(Math.min(promos.length - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth))));
  }

  return (
    <section aria-label={en ? "Highlights" : "Novedades"} className={cn("min-w-0", className)}>
      <div className="mb-3 flex justify-center gap-1.5" aria-hidden>
        {promos.map((promo, i) => (
          <span key={promo.id} className={cn("h-[3px] w-6 rounded-full transition-colors", i === index ? "bg-fg" : "bg-border-strong")} />
        ))}
      </div>
      <ul
        ref={scroller}
        onScroll={onScroll}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain pb-3 [scrollbar-width:none]"
      >
        {promos.map((promo) => (
          <li key={promo.id} className="w-full shrink-0 snap-center px-0.5">
            <div className="flex min-h-[148px] items-stretch gap-4 rounded-[28px] border border-border bg-bg p-5 shadow-sm">
              <div className="flex min-w-0 flex-1 flex-col">
                <h3 className="text-[19px] leading-6 font-bold tracking-tight text-fg">{promo.title}</h3>
                <p className="mt-1.5 text-[14px] leading-5 text-fg-muted">{promo.body}</p>
                {promo.cta ? (
                  <Link href={promo.cta.href} className="mt-auto inline-flex min-h-9 items-center pt-2 text-[14px] font-semibold text-fg underline underline-offset-4">
                    {promo.cta.label}
                  </Link>
                ) : null}
              </div>
              <div aria-hidden className="grid size-20 shrink-0 place-items-center self-center rounded-3xl bg-fg text-bg">
                {promo.art}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
