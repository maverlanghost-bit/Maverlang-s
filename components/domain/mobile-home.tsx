"use client";

import { useRef, useState, type ReactNode, type SVGProps } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { AssistantGuestSheet } from "@/components/app-shell/assistant-guest-sheet";
import { getMe } from "@/lib/api/client";
import { IconChart, IconChevron, IconPortfolio, IconStar, IconWallet } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useHideBalance } from "@/lib/hooks/use-hide-balance";
import { useT } from "@/lib/hooks/use-t";
import { LANDING_MIN_ORDER_USD } from "@/lib/market/asset-status.shared";

/**
 * Inicio del Mercado en celular: acciones principales, 4 accesos (Cartera,
 * Herramientas, Asistente, Alertas) y carrusel según haya sesión o no.
 */

type SvgProps = SVGProps<SVGSVGElement>;

function glyph(props: SvgProps, children: ReactNode) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      {children}
    </svg>
  );
}

const GlyphDeposit = (p: SvgProps) => glyph(p, <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />);
const GlyphCrypto = (p: SvgProps) =>
  glyph(p, <><circle cx="12" cy="12" r="8" /><path d="M10 8h3a1.8 1.8 0 0 1 0 3.6h-3m0 0h3.4a1.8 1.8 0 0 1 0 3.6H10m0-7.2v7.2" /></>);
const GlyphCopy = (p: SvgProps) =>
  glyph(p, <><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.5M17.5 14.2a5.5 5.5 0 0 1 3 4.8" /></>);
const GlyphTools = (p: SvgProps) => glyph(p, <path d="M4 6h16M7 12h10M10 18h4" />);
const AiMark = ({ className }: { className?: string }) => (
  <span aria-hidden className={cn("font-semibold leading-none tracking-tight", className)}>
    AI
  </span>
);
const GlyphAlert = (p: SvgProps) =>
  glyph(p, <path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15L6 17Zm4 4h4" />);
const GlyphClock = (p: SvgProps) => glyph(p, <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>);

export function MobileQuickActions({
  showCopy = false,
  className,
  align = "grid",
}: {
  showCopy?: boolean;
  className?: string;
  /** "start": fila alineada a la izquierda con huecos fijos (escritorio). */
  align?: "grid" | "start";
}) {
  const { language } = useT();
  const en = language === "en";
  const { userId } = useHideBalance();
  // Sin sesión, Depositar y Billetera llevan al registro; Cripto y Copiar van a su ruta.
  const gate = "/app/registro";
  const actions = [
    { id: "crypto", label: en ? "Crypto" : "Cripto", href: "/app/cripto", icon: <GlyphCrypto className="size-6" /> },
    showCopy
      ? { id: "copy", label: en ? "Copy" : "Copiar", href: "/app/copiar", icon: <GlyphCopy className="size-6" /> }
      : { id: "favorites", label: en ? "Favorites" : "Favoritas", href: "/app/favoritas", icon: <IconStar className="size-6" /> },
    { id: "deposit", label: en ? "Deposit" : "Depositar", href: userId ? "/app/billetera/depositar" : gate, icon: <GlyphDeposit className="size-6" /> },
    { id: "wallet", label: en ? "Wallet" : "Billetera", href: userId ? "/app/billetera" : gate, icon: <IconWallet className="size-6" /> },
  ];
  return (
    <nav aria-label={en ? "Main actions" : "Acciones principales"} className={cn(align === "start" ? "flex flex-wrap gap-x-8 gap-y-4" : "grid grid-cols-4 gap-2", className)}>
      {actions.map((action) => (
        <Link key={action.id} href={action.href} className={cn("group flex flex-col items-center gap-2 py-1 outline-none", align === "start" && "min-w-16")}>
          <span className="grid size-14 place-items-center rounded-full bg-fg text-bg transition-transform group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-fg group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-bg">
            {action.icon}
          </span>
          <span className="text-[13px] leading-4 font-medium text-fg">{action.label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function MobileShortcuts({ className }: { className?: string }) {
  const { language } = useT();
  const en = language === "en";
  const { userId } = useHideBalance();
  const [guestSheet, setGuestSheet] = useState(false);
  const items = [
    { href: "/app/cartera", label: en ? "Portfolio" : "Cartera", icon: <IconPortfolio className="size-7" /> },
    { href: "/app/herramientas", label: en ? "Tools" : "Herramientas", icon: <GlyphTools className="size-7" /> },
    { href: "/app/asistente", label: en ? "Assistant" : "Asistente", icon: <AiMark className="text-[17px]" /> },
    { href: "/app/alertas", label: en ? "Alerts" : "Alertas", icon: <GlyphAlert className="size-7" /> },
  ];
  return (
    <nav aria-label={en ? "Shortcuts" : "Accesos"} className={cn("grid grid-cols-4 gap-2", className)}>
      {items.map((item) => {
        const inner = (
          <>
            <span className="grid size-[52px] place-items-center rounded-2xl bg-surface-1 text-fg transition-transform group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-fg">
              {item.icon}
            </span>
            <span className="max-w-full truncate text-xs leading-4 text-fg-body">{item.label}</span>
          </>
        );
        const cls = "group flex flex-col items-center gap-1.5 outline-none";
        if (item.href === "/app/asistente" && !userId) {
          return (
            <button key={item.href} type="button" aria-haspopup="dialog" onClick={() => setGuestSheet(true)} className={cls}>
              {inner}
            </button>
          );
        }
        return (
          <Link key={item.href} href={item.href} className={cls}>
            {inner}
          </Link>
        );
      })}
      {!userId ? <AssistantGuestSheet open={guestSheet} onOpenChange={setGuestSheet} /> : null}
    </nav>
  );
}

/** Accesos en escritorio: tarjetas horizontales con ícono, nombre y una línea de descripción. */
export function DesktopShortcuts({ className }: { className?: string }) {
  const { language } = useT();
  const en = language === "en";
  const { userId } = useHideBalance();
  const [guestSheet, setGuestSheet] = useState(false);
  const items = [
    { href: "/app/cartera", label: en ? "Portfolio" : "Cartera", hint: en ? "Your positions and results" : "Tus posiciones y resultado", icon: <IconPortfolio className="size-5" /> },
    { href: "/app/herramientas", label: en ? "Tools" : "Herramientas", hint: en ? "Screener, compare and more" : "Screener, comparar y más", icon: <GlyphTools className="size-5" /> },
    { href: "/app/asistente", label: en ? "Assistant" : "Asistente", hint: en ? "Ask about stocks and your portfolio" : "Pregunta sobre acciones y tu cartera", icon: <AiMark className="text-[15px]" /> },
    { href: "/app/alertas", label: en ? "Alerts" : "Alertas", hint: en ? "Price notices" : "Avisos de precio", icon: <GlyphAlert className="size-5" /> },
  ];
  const cardCls =
    "group flex min-h-14 min-w-0 items-center gap-3 rounded-[14px] bg-surface-1 px-3 py-2.5 text-left outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-fg";
  return (
    <nav aria-label={en ? "Shortcuts" : "Accesos"} className={cn("grid grid-cols-4 gap-3", className)}>
      {items.map((item) => {
        const inner = (
          <>
            <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-bg text-fg">{item.icon}</span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[14px] leading-5 font-semibold text-fg">{item.label}</span>
              <span className="truncate text-[12px] leading-4 text-fg-muted">{item.hint}</span>
            </span>
          </>
        );
        if (item.href === "/app/asistente" && !userId) {
          return (
            <button key={item.href} type="button" aria-haspopup="dialog" onClick={() => setGuestSheet(true)} className={cardCls}>
              {inner}
            </button>
          );
        }
        return (
          <Link key={item.href} href={item.href} className={cardCls}>
            {inner}
          </Link>
        );
      })}
      {!userId ? <AssistantGuestSheet open={guestSheet} onOpenChange={setGuestSheet} /> : null}
    </nav>
  );
}

type Promo = { id: string; title: string; body: string; cta?: { label: string; href: string }; art: ReactNode };

export function MobilePromoCarousel({ className, desktop = false }: { className?: string; desktop?: boolean }) {
  const { language } = useT();
  const en = language === "en";
  const { userId } = useHideBalance();
  const me = useQuery({ queryKey: ["me"], queryFn: getMe, enabled: Boolean(userId) });
  const scroller = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);

  const practice: Promo = {
    id: "practice",
    title: en ? "Keep practicing" : "Sigue practicando",
    body: en ? "Your practice balance is waiting: buy and sell without using real money." : "Tu saldo de práctica te espera: compra y vende sin usar dinero real.",
    cta: { label: en ? "See stocks" : "Ver acciones", href: "#acciones" },
    art: <IconChart className="size-8" />,
  };
  // La cuenta real sigue apagada en la app: sólo se invita a dejar el perfil listo, sin prometer depósitos.
  const signedIn: Promo[] =
    me.data && !me.data.onboardingCompleted
      ? [
          {
            id: "profile",
            title: en ? "Complete your sign-up" : "Completa tu registro",
            body: en ? "We ask for your details once, to invest with real money." : "Te pedimos tus datos una sola vez para invertir con dinero real.",
            cta: { label: en ? "Complete" : "Completar", href: "/app/onboarding" },
            art: <IconWallet className="size-8" />,
          },
          practice,
        ]
      : [
          ...(me.data
            ? [
                {
                  id: "real",
                  title: en ? "Get your real account ready" : "Deja lista tu cuenta real",
                  body: en ? "Your details are in. We'll tell you when deposits open." : "Tus datos están listos. Te avisamos cuando abramos los depósitos.",
                  art: <IconWallet className="size-8" />,
                },
              ]
            : []),
          practice,
        ];

  const guest: Promo[] = [
    {
      id: "demo",
      title: en ? "Practice with US$10,000 in play money" : "Practica con US$10.000 ficticios",
      body: en ? "Try buying and selling without risking real money." : "Prueba comprar y vender sin arriesgar plata real.",
      cta: { label: en ? "See stocks" : "Ver acciones", href: "#acciones" },
      art: <IconChart className="size-8" />,
    },
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
  const promos = userId ? signedIn : guest;

  function onScroll() {
    const el = scroller.current;
    if (!el || el.clientWidth === 0) return;
    setIndex(Math.min(promos.length - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth))));
  }

  function goTo(target: number) {
    const el = scroller.current;
    if (!el) return;
    const next = Math.min(promos.length - 1, Math.max(0, target));
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    setIndex(next);
  }

  const dots = (
    <div className={cn("flex gap-1.5", desktop ? "items-center" : "mb-3 justify-center")} aria-hidden={desktop ? undefined : true}>
      {promos.map((promo, i) =>
        desktop ? (
          <button
            key={promo.id}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`${i + 1} / ${promos.length}`}
            aria-current={i === index}
            className="grid h-6 w-8 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-fg"
          >
            <span className={cn("h-[3px] w-6 rounded-full transition-colors", i === index ? "bg-fg" : "bg-border-strong")} />
          </button>
        ) : (
          <span key={promo.id} className={cn("h-[3px] w-6 rounded-full transition-colors", i === index ? "bg-fg" : "bg-border-strong")} />
        ),
      )}
    </div>
  );
  const arrowCls =
    "grid size-9 place-items-center rounded-full bg-surface-1 text-fg outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-fg disabled:opacity-40";

  return (
    <section aria-label={en ? "Highlights" : "Novedades"} className={cn("min-w-0", desktop && "flex h-full flex-col", className)}>
      {desktop ? null : dots}
      <ul
        ref={scroller}
        onScroll={onScroll}
        className={cn(
          "no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none]",
          desktop ? "min-h-0 flex-1 pb-2" : "pb-3",
        )}
      >
        {promos.map((promo) => (
          <li key={promo.id} className={cn("w-full shrink-0 snap-center px-0.5", desktop && "flex")}>
            <div className={cn("flex min-h-[148px] items-stretch gap-4 rounded-[28px] border border-border bg-bg p-5 shadow-sm", desktop && "flex-1")}>
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
      {desktop ? (
        <div className="flex items-center justify-between pt-1">
          {dots}
          {promos.length > 1 ? (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label={en ? "Previous" : "Anterior"} className={arrowCls}>
                <IconChevron className="size-4 rotate-90" />
              </button>
              <button type="button" onClick={() => goTo(index + 1)} disabled={index >= promos.length - 1} aria-label={en ? "Next" : "Siguiente"} className={arrowCls}>
                <IconChevron className="size-4 -rotate-90" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
