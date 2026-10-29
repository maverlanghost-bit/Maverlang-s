"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { BrandLogoImage } from "@/components/app-shell/brand-image";
import { esCL } from "@/content/i18n/es-CL";
import { site } from "@/config/site";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { IconMenu } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";

const NAV = [
  { href: "/app", label: esCL.guest.seeStocks },
  { href: "/como-funciona", label: "Cómo funciona" },
  { href: "/costos", label: "Costos" },
  { href: "/seguridad", label: "Seguridad" },
  { href: "/ayuda", label: "Ayuda" },
] as const;

const SCROLL_OFFSET = 8;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isShown(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden";
}

/** `skipInert` omite regiones inertes. El header oculto está inerte: sus controles se listan aparte. */
function focusableWithin(root: ParentNode, skipInert: boolean): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (skipInert && el.closest("[inert]")) return false;
    return isShown(el);
  });
}

function isBefore(a: Node, b: Node): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

function revealHeader(header: HTMLElement) {
  header.inert = false;
  header.classList.remove("-translate-y-full");
  header.classList.add("translate-y-0");
}

function subscribeScroll(onStoreChange: () => void) {
  window.addEventListener("scroll", onStoreChange, { passive: true });
  return () => window.removeEventListener("scroll", onStoreChange);
}

function scrolledSnapshot() {
  return window.scrollY > SCROLL_OFFSET;
}

function scrolledServerSnapshot() {
  return false;
}

const linkClass =
  "whitespace-nowrap rounded-full px-2 py-2 text-sm text-fg-body transition duration-[140ms] ease-spring hover:text-fg active:scale-[0.98]";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const scrolled = useSyncExternalStore(subscribeScroll, scrolledSnapshot, scrolledServerSnapshot);
  /** Se oculta al bajar y reaparece al subir (con el menú abierto, siempre visible). */
  const [hidden, setHidden] = useState(false);
  const [focusedWithin, setFocusedWithin] = useState(false);
  const [keyboardReveal, setKeyboardReveal] = useState(false);
  const lastY = useRef(0);
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const prev = lastY.current;
      lastY.current = y;
      const header = headerRef.current;
      const inside = !!header && header.contains(document.activeElement);
      if (y < 64 || y < prev - 2 || inside) setHidden(false);
      else if (y > prev + 2) {
        setHidden(true);
        setKeyboardReveal(false);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
      const header = headerRef.current;
      if (!header?.inert) return;
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return;
      const items = focusableWithin(header, false);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const outside = focusableWithin(document.body, true).filter((el) => !header.contains(el));
      const index = outside.indexOf(active);
      if (index < 0) return;

      if (!event.shiftKey) {
        const next = outside[index + 1];
        if (!isBefore(active, first) || !(next === undefined || isBefore(last, next))) return;
        event.preventDefault();
        revealHeader(header);
        setKeyboardReveal(true);
        setFocusedWithin(true);
        first.focus();
        return;
      }

      const prev = index > 0 ? outside[index - 1] : undefined;
      if (!isBefore(last, active) || !(prev === undefined || isBefore(prev, first))) return;
      event.preventDefault();
      revealHeader(header);
      setKeyboardReveal(true);
      setFocusedWithin(true);
      last.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const show = !hidden || open || focusedWithin || keyboardReveal;

  return (
    <header
      ref={headerRef}
      inert={!show}
      onFocus={() => setFocusedWithin(true)}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setFocusedWithin(false);
      }}
      className={cn(
        "fixed inset-x-0 top-0 z-40 h-16 border-b transition-[background-color,border-color,backdrop-filter,transform] duration-500 ease-spring",
        scrolled ? "border-border bg-bg/80 backdrop-blur-md" : "border-transparent bg-transparent",
        show ? "translate-y-0" : "-translate-y-full",
      )}
    >
      <div className="mx-auto flex h-full max-w-7xl items-center gap-2 px-5 sm:gap-3">
        <Link href="/" aria-label={site.name} className="flex min-w-0 shrink items-center rounded-full text-fg">
          <BrandLogoImage />
        </Link>

        <nav aria-label="Principal" className="ml-auto hidden items-center gap-4 md:flex lg:gap-6">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={linkClass}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-4">
          <Button asChild size="md" className="min-h-11 px-4">
            <Link href="/app/ingresar">Entrar</Link>
          </Button>
          <IconButton
            label={open ? "Cerrar menú" : "Abrir menú"}
            size="md"
            className="md:hidden"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <IconMenu />
          </IconButton>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen} title="Menú">
        <nav aria-label="Móvil" className="flex flex-col">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex h-12 items-center rounded-xl px-3 text-base text-fg transition duration-[140ms] ease-spring hover:bg-surface-2 active:scale-[0.98]"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <Button asChild className="mt-4 min-h-11 w-full">
            <Link href="/app/ingresar" onClick={() => setOpen(false)}>
              Entrar
            </Link>
          </Button>
        </nav>
      </Sheet>
    </header>
  );
}
