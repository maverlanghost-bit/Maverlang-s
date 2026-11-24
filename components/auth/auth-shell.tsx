import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

import { BrandFavicon, BrandLogoImage } from "@/components/app-shell/brand-image";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { IconArrow, IconClock, IconStar, IconWallet } from "@/components/ui/icons";
import { site } from "@/config/site";
import { tickerBySymbol } from "@/config/tickers";
import { cn } from "@/lib/cn";
import { LANDING_MIN_ORDER_USD } from "@/lib/market/asset-status.shared";

/**
 * Plantilla única de las pantallas previas al ingreso (ingresar, verificar,
 * registro, recuperar, restablecer). Sólo presentación: no conoce la sesión ni
 * los formularios.
 *
 * - Escritorio (`lg`+): formulario a la izquierda y, a la derecha, un panel con la
 *   ilustración de cordillera de fondo (decorativa) y una composición "bento" de
 *   vidrio claro: vista de ejemplo de la app y dos datos del producto.
 * - Móvil (< lg): la ilustración ocupa toda la pantalla (fija); isotipo arriba y el formulario
 *   en una tarjeta blanca sólida. Sin chips ni enlaces de pie (sólo en escritorio).
 *
 * La columna del formulario ajusta, por descendencia, las piezas compartidas
 * que también usa la plataforma (`AuthCard`, `Input`, `Select`): acá la tarjeta
 * va sin borde ni relleno, el logo lo pone la plantilla y los campos son
 * blancos con borde de control. Fuera de la plantilla esas piezas no cambian.
 */
const FORM_COLUMN_OVERRIDES = cn(
  // La tarjeta de acceso se aplana: la columna ya es el contenedor.
  "[&_[data-auth-card]]:my-0 [&_[data-auth-card]]:max-w-none [&_[data-auth-card]]:rounded-none",
  "[&_[data-auth-card]]:border-0 [&_[data-auth-card]]:bg-transparent [&_[data-auth-card]]:p-0",
  // El logo de la tarjeta se oculta: lo muestra la cabecera de la plantilla.
  "[&_[data-auth-logo]]:hidden",
  // Campos blancos con borde de control (el relleno gris se leía deshabilitado).
  "[&_input:not([type=checkbox]):not([type=radio])]:bg-bg",
  "[&_button[aria-haspopup=listbox]]:bg-bg",
  // Títulos de la familia: peso 600.
  "[&_h1]:font-semibold",
);

const footLinkClass =
  "inline-flex min-h-11 items-center rounded-sm px-1.5 text-[13px] text-fg-muted underline decoration-transparent underline-offset-4 transition-colors hover:text-fg hover:decoration-fg";

const glassCard = "rounded-3xl border border-border/60 bg-bg/75 shadow-sm backdrop-blur-md";

/** Acciones de la vista de ejemplo. Sin precios ni variaciones: sólo el catálogo. */
const PREVIEW_SYMBOLS = ["AAPLx", "NVDAx", "TSLAx"] as const;

function PreviewRow({ symbol }: { symbol: string }) {
  const ticker = tickerBySymbol(symbol);
  if (!ticker) return null;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <TickerLogo symbol={ticker.symbol} logoUrl={ticker.logo} size={32} decorative />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] leading-tight font-medium text-fg">{ticker.name}</p>
        <p className="num text-[12px] text-fg-muted">{ticker.symbol}</p>
      </div>
      <span className="h-2 w-14 rounded-full bg-surface-3" />
    </li>
  );
}

/** Mockup estático y recortado abajo. Decorativo: no es información de la cuenta. */
function AppPreview() {
  return (
    <div aria-hidden="true" className={cn(glassCard, "relative h-64 overflow-hidden px-6 pt-5 [@media(max-height:700px)]:hidden")}>
      <div className="flex items-center justify-between">
        <p className="label">Modo práctica</p>
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] text-fg-muted">Vista de ejemplo</span>
      </div>
      <p className="num mt-2 text-[2rem] leading-none font-semibold tracking-tight text-fg">US$10.000</p>
      <p className="mt-1 text-[12px] text-fg-muted">ficticios para practicar</p>
      <div className="mt-4 flex gap-3">
        {[
          { label: "Comprar", icon: <IconArrow direction="up" className="size-4" /> },
          { label: "Vender", icon: <IconArrow direction="down" className="size-4" /> },
          { label: "Billetera", icon: <IconWallet className="size-4" /> },
        ].map((action) => (
          <span key={action.label} className="flex flex-col items-center gap-1">
            <span className="grid size-9 place-items-center rounded-full bg-fg text-bg">{action.icon}</span>
            <span className="text-[11px] text-fg-muted">{action.label}</span>
          </span>
        ))}
      </div>
      <ul className="mt-3 divide-y divide-border/70">
        {PREVIEW_SYMBOLS.map((symbol) => (
          <PreviewRow key={symbol} symbol={symbol} />
        ))}
      </ul>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg to-transparent" />
    </div>
  );
}

function FactCard({
  icon,
  value,
  label,
  note,
}: {
  icon: ReactNode;
  value: string;
  label: string;
  note?: string;
}) {
  return (
    <div className={cn(glassCard, "flex min-h-[9.5rem] flex-col justify-between gap-4 p-5")}>
      <span
        aria-hidden="true"
        className="flex size-9 items-center justify-center rounded-full border border-border bg-bg text-fg"
      >
        {icon}
      </span>
      <div>
        <p className="num text-[2rem] leading-none font-semibold tracking-tight text-fg">{value}</p>
        <p className="mt-1.5 text-[13px] text-fg-muted">{label}</p>
        {note ? <p className="mt-1 text-[11px] leading-snug text-pretty text-fg-muted">{note}</p> : null}
      </div>
    </div>
  );
}

function AuthAside() {
  return (
    <aside
      aria-labelledby="auth-aside-title"
      className="relative hidden overflow-hidden border-l border-border bg-surface-1 lg:sticky lg:top-0 lg:block lg:h-dvh"
    >
      <Image
        src="/brand/auth/fondo-login.webp"
        alt=""
        fill
        sizes="50vw"
        className="object-cover object-bottom"
      />
      {/* Velo suave desde el color del cielo de la ilustración para sostener el texto. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-2/3 bg-gradient-to-b from-[#e6e6e6] via-[#e6e6e6]/70 to-transparent"
      />
      <div className="relative z-10 mx-auto flex h-full max-w-[28rem] flex-col justify-center gap-6 px-8 py-10">
        <div className="text-center">
          <p className="label">{site.name}</p>
          <h2
            id="auth-aside-title"
            className="mt-3 text-[1.75rem] leading-[1.12] font-semibold tracking-tight text-balance text-fg xl:text-[2rem]"
          >
            Invierte en acciones de EE.UU. desde Chile
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-pretty text-fg-body">
            Compra fracciones, paga en pesos y guarda tus tokens en tu propia billetera.
          </p>
        </div>
        <div className="space-y-4">
          <AppPreview />
          <div className="grid grid-cols-2 gap-4">
            <FactCard icon={<IconStar />} value={`US$${LANDING_MIN_ORDER_USD}`} label="mínimo por orden" />
            <FactCard
              icon={<IconClock />}
              value="24/7"
              label="para operar"
              note="Fuera del horario regular de la bolsa de EE.UU., el precio puede variar más."
            />
          </div>
        </div>
      </div>
    </aside>
  );
}

/** Tarjeta blanca sólida sólo móvil; en `lg` se neutraliza (columna plana). */
const MOBILE_CARD =
  "border border-border bg-bg shadow-xl lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate grid min-h-dvh bg-[#e6e6e6] lg:grid-cols-2 lg:bg-bg">
      {/* Móvil: ilustración a pantalla completa, fija bajo la tarjeta. Decorativa. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-[#e6e6e6] lg:hidden">
        <Image
          src="/brand/auth/fondo-login.webp"
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-[50%_75%]"
        />
      </div>
      <div className={cn("flex min-h-dvh min-w-0 flex-col lg:px-12 lg:py-4", FORM_COLUMN_OVERRIDES)}>
        {/* Móvil: isotipo (el de la barra lateral) sobre el cielo. El h1 lo pone el formulario. */}
        <div className="mx-auto w-full max-w-md px-5 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 lg:hidden">
          <Link href="/" aria-label={site.name} className="inline-flex min-h-11 min-w-11 items-center rounded-sm">
            <BrandFavicon className="w-9" />
          </Link>
        </div>
        <header className="hidden lg:block">
          <Link href="/" aria-label={site.name} className="inline-flex min-h-11 items-center rounded-sm">
            <BrandLogoImage />
          </Link>
        </header>
        <main className="flex flex-col lg:flex-1 lg:items-center lg:justify-center lg:py-10">
          <div className="mx-auto w-full max-w-md px-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4 lg:max-w-sm lg:px-0 lg:pb-0">
            {/* Móvil: tarjeta blanca sólida. Escritorio: sin tarjeta. */}
            <div className={cn(MOBILE_CARD, "rounded-[28px] p-5 sm:p-6")}>{children}</div>
          </div>
        </main>
        {/* Sólo escritorio: enlaces bajo el formulario. */}
        <div className="mx-auto hidden w-full max-w-sm lg:block">
          <footer className="border-t border-border pt-2">
            <nav aria-label="Ayuda y documentos legales" className="-mx-1.5 flex flex-wrap gap-x-2">
              <Link href="/ayuda" className={footLinkClass}>
                Ayuda
              </Link>
              <Link href="/legal/terminos" className={footLinkClass}>
                Términos
              </Link>
              <Link href="/legal/privacidad" className={footLinkClass}>
                Privacidad
              </Link>
            </nav>
          </footer>
        </div>
      </div>
      <AuthAside />
    </div>
  );
}
